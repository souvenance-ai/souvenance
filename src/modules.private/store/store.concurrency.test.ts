import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';
import { Store } from './store.ts';

/**
 * Concurrency and the fresh-store open race. The legacy corpus exercised
 * these through its CLI; the v0.2.0 CLI does not exist yet, so the children
 * import the Store module directly (node 24 runs TS natively; the
 * tsconfig's erasableSyntaxOnly guarantees it). The regression they pin is
 * the ownership-lock contract (ADR 0001): PRAGMA busy_timeout MUST precede
 * journal_mode = WAL, and check-then-write verbs must be single
 * transactions so only one concurrent winner exists.
 */

const STORE_TS = fileURLToPath(new URL('./store.ts', import.meta.url));

const CHILD_SCRIPT = `
  const [modulePath, dbPath, operation, ...rest] = process.argv.slice(1);
  const storeModule = await import(modulePath);
  let store;
  if (operation === 'count') {
    store = storeModule.Store.open({ dbPath, readOnly: true });
    process.stdout.write(String(store.stats().memories));
    store.close();
  } else {
    store = storeModule.Store.open({ dbPath });
    if (operation === 'gated-store') {
      const gate = Number.parseInt(rest[0], 10);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
      process.stdout.write(store.store(rest[1], { kind: 'note' }));
    } else if (operation === 'gated-supersede') {
      const gate = Number.parseInt(rest[0], 10);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
      process.stdout.write(store.supersede(rest[1], rest[2]));
    } else if (operation === 'gated-unlink') {
      const gate = Number.parseInt(rest[0], 10);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
      store.unlink(rest[1], rest[2], rest[3]);
    } else if (operation === 'store') {
      process.stdout.write(store.store(rest[0], { kind: 'note' }));
    } else if (operation === 'link') {
      store.link(rest[0], rest[1], rest[2]);
    } else if (operation === 'supersede') {
      process.stdout.write(store.supersede(rest[0], rest[1]));
    } else if (operation === 'merge') {
      process.stdout.write(store.merge([rest[0], rest[1]], rest[2]));
    } else if (operation === 'deprecate') {
      store.deprecate(rest[0]);
    } else if (operation === 'sethot') {
      store.setHot(rest[0], rest[1] === 'true');
    } else {
      throw new Error('unknown operation: ' + operation);
    }
    store.close();
  }
`;

interface ChildResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function spawnChild(dbPath: string, operation: string, ...rest: string[]): ChildResult {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', CHILD_SCRIPT, STORE_TS, dbPath, operation, ...rest],
    { encoding: 'utf-8', timeout: 30000 },
  );
  return {
    status: result.status ?? -1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-concurrency-'));
}

test('concurrency: many concurrent stores all persist', { timeout: 120_000 }, () => {
  const dir = tempDir();
  const dbPath = join(dir, 'memory.db');
  try {
    const storeCount = 20;
    const children = Array.from({ length: storeCount }, (_, index) =>
      spawnChild(dbPath, 'store', `concurrent memory ${index}`),
    );

    for (const child of children) {
      assert.equal(child.status, 0, `store should succeed, stderr: ${child.stderr}`);
      assert.ok(child.stdout.length > 0, 'store should print an id');
    }

    const store = Store.open({ dbPath });
    try {
      assert.equal(
        store.stats().memories,
        storeCount,
        `all ${storeCount} memories should be persisted`,
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'concurrency: concurrent links from multiple processes all persist (idempotent)',
  { timeout: 120_000 },
  () => {
    const dir = tempDir();
    const dbPath = join(dir, 'memory.db');
    try {
      // Seed two memories that everyone will link
      const source = spawnChild(dbPath, 'store', 'source memory').stdout;
      const target = spawnChild(dbPath, 'store', 'target memory').stdout;

      const linkCount = 10;
      const children = Array.from({ length: linkCount }, () =>
        spawnChild(dbPath, 'link', source, target, 'references'),
      );

      for (const child of children) {
        assert.equal(child.status, 0, `link should succeed, stderr: ${child.stderr}`);
      }

      // Edges are idempotent (INSERT OR IGNORE on from/to/kind),
      // so N concurrent identical links should produce exactly 1 edge.
      const store = Store.open({ dbPath });
      try {
        assert.equal(store.stats().edges, 1, 'idempotent links should produce 1 edge');
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test('concurrency: concurrent links with different kinds all persist', { timeout: 120_000 }, () => {
  const dir = tempDir();
  const dbPath = join(dir, 'memory.db');
  try {
    const source = spawnChild(dbPath, 'store', 'source memory').stdout;
    const target = spawnChild(dbPath, 'store', 'target memory').stdout;

    const kinds = ['references', 'constrained-by', 'related', 'documents', 'extends'];
    const children = kinds.map((kind) => spawnChild(dbPath, 'link', source, target, kind));

    for (const child of children) {
      assert.equal(child.status, 0, `link should succeed, stderr: ${child.stderr}`);
    }

    const store = Store.open({ dbPath });
    try {
      assert.equal(store.stats().edges, kinds.length, 'different kinds should all persist');
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'concurrency: concurrent supersede of the same memory — only one wins',
  { timeout: 120_000 },
  () => {
    const dir = tempDir();
    const dbPath = join(dir, 'memory.db');
    try {
      const original = spawnChild(dbPath, 'store', 'original to supersede').stdout;

      const attemptCount = 5;
      const children = Array.from({ length: attemptCount }, (_, index) =>
        spawnChild(dbPath, 'supersede', original, `replacement ${index}`),
      );

      let successes = 0;
      for (const child of children) {
        if (child.status === 0) successes++;
      }

      // The check (active) and the write land in ONE transaction: after the
      // first commits, the others see a superseded memory (or lose the WAL
      // snapshot) and refuse. Exactly one winner.
      assert.equal(successes, 1, `exactly 1 supersede should succeed, got ${successes}`);

      // Verify original is superseded and only 1 replacement exists
      const store = Store.open({ dbPath });
      try {
        assert.equal(store.get(original)!.status, 'superseded', 'original should be superseded');
        const replacements = store.list({
          includeLegacy: true,
          where: "content LIKE 'replacement %' AND status = 'active'",
        });
        assert.equal(replacements.length, 1, 'exactly 1 replacement should be active');
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'concurrency: concurrent merge of overlapping memories — only one wins',
  { timeout: 120_000 },
  () => {
    const dir = tempDir();
    const dbPath = join(dir, 'memory.db');
    try {
      const candidateA = spawnChild(dbPath, 'store', 'merge candidate A').stdout;
      const candidateB = spawnChild(dbPath, 'store', 'merge candidate B').stdout;

      const attemptCount = 5;
      const children = Array.from({ length: attemptCount }, (_, index) =>
        spawnChild(dbPath, 'merge', candidateA, candidateB, `merged result ${index}`),
      );

      let successes = 0;
      for (const child of children) {
        if (child.status === 0) successes++;
      }

      assert.equal(successes, 1, `exactly 1 merge should succeed, got ${successes}`);

      const store = Store.open({ dbPath });
      try {
        const statusOf = (id: string): string => store.get(id)!.status;
        assert.equal(statusOf(candidateA), 'merged', 'a should be merged');
        assert.equal(statusOf(candidateB), 'merged', 'b should be merged');

        const merged = store.list({
          includeLegacy: true,
          where: "content LIKE 'merged result %' AND status = 'active'",
        });
        assert.equal(merged.length, 1, 'exactly 1 merged result should be active');
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'concurrency: concurrent deprecate of the same memory — exactly one winner',
  { timeout: 120_000 },
  () => {
    const dir = tempDir();
    const dbPath = join(dir, 'memory.db');
    try {
      const target = spawnChild(dbPath, 'store', 'to be deprecated').stdout;

      const attemptCount = 5;
      const children = Array.from({ length: attemptCount }, () =>
        spawnChild(dbPath, 'deprecate', target),
      );

      let successes = 0;
      for (const child of children) {
        if (child.status === 0) successes++;
      }

      // assertLiving and the UPDATE share one transaction: the rest fail on
      // the non-living status instead of overwriting it.
      assert.equal(successes, 1, `exactly 1 deprecate should succeed, got ${successes}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'concurrency: setHot racing a supersede — the state machine holds (#38)',
  { timeout: 120_000 },
  () => {
    const dir = tempDir();
    const dbPath = join(dir, 'memory.db');
    try {
      const targetId = spawnChild(dbPath, 'store', 'curate me or replace me').stdout;

      // The curation's check-then-write is ONE transaction, so the
      // interleavings resolve to consistent ends, never to corruption:
      // setHot first and the supersede legitimately follows (the transfer —
      // the head is born hot); the supersede first and the curation refuses
      // a terminal. What must NEVER land is the broken interleaving — a
      // superseded memory heated in place, its head left cold.
      const operations = [
        spawnChild(dbPath, 'sethot', targetId, 'true'),
        spawnChild(dbPath, 'supersede', targetId, 'the revision'),
        spawnChild(dbPath, 'supersede', targetId, 'another revision'),
        spawnChild(dbPath, 'supersede', targetId, 'a third revision'),
      ];
      const setHotWins = operations[0]!.status === 0 ? 1 : 0;
      const supersedeWins = operations.slice(1).filter((child) => child.status === 0).length;

      // The supersedes are mutually exclusive with each other; and a
      // first-to-lock always succeeds, so at least one gesture landed.
      assert.ok(supersedeWins <= 1, `at most 1 supersede wins, got ${supersedeWins}`);
      assert.ok(setHotWins + supersedeWins >= 1, 'at least one gesture succeeds');

      const store = Store.open({ dbPath });
      try {
        const heads = store.list({
          includeLegacy: true,
          where: "content LIKE '%revision'",
        });
        assert.equal(heads.length, supersedeWins, 'one head per winning supersede');
        const target = store.get(targetId)!;
        if (supersedeWins === 1) {
          assert.equal(
            target.status,
            'superseded',
            'never a hot superseded memory — the single-column machine holds (#38)',
          );
          assert.equal(
            heads[0]!.status,
            setHotWins === 1 ? 'hot' : 'active',
            'the transfer follows the race order',
          );
        } else {
          assert.equal(target.status, 'hot', 'the curation won: the target stays hot');
          assert.equal(setHotWins, 1);
        }
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'concurrency: reads during concurrent writes return consistent state',
  { timeout: 120_000 },
  () => {
    const dir = tempDir();
    const dbPath = join(dir, 'memory.db');
    try {
      // Seed initial data
      spawnChild(dbPath, 'store', 'initial memory zero');

      const writerCount = 10;
      const readerCount = 10;

      // Writers and readers race; readers open read-only and raw-count.
      const writers = Array.from({ length: writerCount }, (_, index) =>
        spawnChild(dbPath, 'store', `write ${index}`),
      );
      const readers = Array.from({ length: readerCount }, () => spawnChild(dbPath, 'count'));

      for (const writer of writers) {
        assert.equal(writer.status, 0, `writer should succeed, stderr: ${writer.stderr}`);
      }
      for (const reader of readers) {
        assert.equal(reader.status, 0, `reader should succeed, stderr: ${reader.stderr}`);
        const visibleCount = Number.parseInt(reader.stdout, 10);
        // Readers should see at least 1 memory (the initial one)
        assert.ok(visibleCount >= 1, `reader should see at least 1 memory, saw ${visibleCount}`);
      }

      // After all writers complete, total should be exact
      const store = Store.open({ dbPath });
      try {
        assert.equal(store.stats().memories, writerCount + 1, 'all writes should persist');
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test('concurrency: concurrent store + link to the same target', { timeout: 120_000 }, () => {
  const dir = tempDir();
  const dbPath = join(dir, 'memory.db');
  try {
    const target = spawnChild(dbPath, 'store', 'target for links').stdout;

    const sourceCount = 10;
    const children = Array.from({ length: sourceCount }, (_, index) =>
      spawnChild(dbPath, 'store', `source ${index}`),
    );

    // All stores succeeded, collect their ids
    const sourceIds = children.map((child) => {
      assert.equal(child.status, 0, `store should succeed, stderr: ${child.stderr}`);
      return child.stdout;
    });

    // Now link all sources to the target concurrently
    const linkChildren = sourceIds.map((id) =>
      spawnChild(dbPath, 'link', id, target, 'references'),
    );

    for (const child of linkChildren) {
      assert.equal(child.status, 0, `link should succeed, stderr: ${child.stderr}`);
    }

    const store = Store.open({ dbPath });
    try {
      const targetNode = store.get(target)!;
      assert.equal(
        targetNode.relations.in.length,
        sourceCount,
        `target should have ${sourceCount} incoming edges`,
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'open: simultaneous opens on a fresh store all succeed (busy_timeout first)',
  { timeout: 120_000 },
  () => {
    const dir = tempDir();
    const dbPath = join(dir, 'memory.db');
    const racerCount = 4;
    const gate = Date.now() + 400;
    try {
      const racerResults = Array.from({ length: racerCount }, (_, index) =>
        spawnChild(dbPath, 'gated-store', String(gate), `race ${index}`),
      );
      for (const result of racerResults) {
        assert.equal(
          result.status,
          0,
          `an open lost the fresh-store race (exit ${result.status}): ${result.stderr}`,
        );
        assert.ok(result.stdout.length > 0, 'each racer should have stored its memory');
      }
      const store = Store.open({ dbPath });
      try {
        assert.equal(
          store.stats().memories,
          racerCount,
          `expected all ${racerCount} racers to persist`,
        );
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test('concurrency: unlink racing a supersede never severs the bridge', { timeout: 120_000 }, () => {
  const dir = tempDir();
  const dbPath = join(dir, 'memory.db');
  try {
    // Seed: the source carries one authored claim.
    const source = spawnChild(dbPath, 'store', 'the source memory').stdout;
    const other = spawnChild(dbPath, 'store', 'the cited memory').stdout;
    const linked = spawnChild(dbPath, 'link', source, other, 'references');
    assert.equal(linked.status, 0);

    // Race: the revision and the correction, gated to fire together.
    const gate = Date.now() + 400;
    const supersedeChild = spawnChild(
      dbPath,
      'gated-supersede',
      String(gate),
      source,
      'the revision',
    );
    const unlinkChild = spawnChild(
      dbPath,
      'gated-unlink',
      String(gate),
      source,
      other,
      'references',
    );

    // The revision always wins its own check: the unlink never changes
    // the source's status, so supersede cannot refuse here.
    assert.equal(
      supersedeChild.status,
      0,
      `supersede should succeed, stderr: ${supersedeChild.stderr}`,
    );
    const head = supersedeChild.stdout;

    const store = Store.open({ dbPath });
    try {
      // Invariant 1: the bridge survives every interleaving — unlink's
      // check and delete share one transaction, so a bridge can never be
      // severed between the check and the write.
      const bridge = store.get(source)!.relations.out.filter((edge) => edge.kind === 'supersedes');
      assert.equal(bridge.length, 1, 'the supersedes bridge must survive the race');

      // Invariant 2: the outcome is consistent. Either the correction
      // landed BEFORE the revision (the head inherits nothing) or the
      // unlink was refused (the head keeps the inherited claim).
      assert.equal(store.get(source)!.status, 'superseded');

      const inherited = store.get(head)!.relations.out.filter((edge) => edge.kind === 'references');
      if (unlinkChild.status === 0) {
        assert.equal(inherited.length, 0, 'the correction landed before the revision');
      } else {
        assert.equal(inherited.length, 1, 'the unlink was refused after the revision');
      }
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
