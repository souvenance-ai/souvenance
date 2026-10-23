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
    const row = store.db.prepare('SELECT count(*) AS c FROM memories').get();
    process.stdout.write(String(row.c));
    store.close();
  } else {
    store = storeModule.Store.open({ dbPath });
    if (operation === 'gated-store') {
      const gate = Number.parseInt(rest[0], 10);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
      process.stdout.write(store.store(rest[1]));
    } else if (operation === 'store') {
      process.stdout.write(store.store(rest[0]));
    } else if (operation === 'link') {
      store.link(rest[0], rest[1], rest[2]);
    } else if (operation === 'supersede') {
      process.stdout.write(store.supersede(rest[0], rest[1]));
    } else if (operation === 'merge') {
      process.stdout.write(store.merge([rest[0], rest[1]], rest[2]));
    } else if (operation === 'deprecate') {
      store.deprecate(rest[0]);
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
      const total = store.db.prepare('SELECT count(*) AS c FROM memories').get() as {
        c: number;
      };
      assert.equal(total.c, storeCount, `all ${storeCount} memories should be persisted`);
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
        const edges = store.db.prepare('SELECT count(*) AS c FROM edges').get() as { c: number };
        assert.equal(edges.c, 1, 'idempotent links should produce 1 edge');
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
      const edges = store.db.prepare('SELECT count(*) AS c FROM edges').get() as { c: number };
      assert.equal(edges.c, kinds.length, 'different kinds should all persist');
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
        const originalRow = store.db
          .prepare('SELECT status FROM memories WHERE id = ?')
          .get(original) as { status: string };
        assert.equal(originalRow.status, 'superseded', 'original should be superseded');

        const replacements = store.db
          .prepare(
            "SELECT count(*) AS c FROM memories WHERE content LIKE 'replacement %' AND status = 'active'",
          )
          .get() as { c: number };
        assert.equal(replacements.c, 1, 'exactly 1 replacement should be active');
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
        const statusOf = (id: string): string =>
          (
            store.db.prepare('SELECT status FROM memories WHERE id = ?').get(id) as {
              status: string;
            }
          ).status;
        assert.equal(statusOf(candidateA), 'merged', 'a should be merged');
        assert.equal(statusOf(candidateB), 'merged', 'b should be merged');

        const merged = store.db
          .prepare(
            "SELECT count(*) AS c FROM memories WHERE content LIKE 'merged result %' AND status = 'active'",
          )
          .get() as { c: number };
        assert.equal(merged.c, 1, 'exactly 1 merged result should be active');
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

      // assertActive and the UPDATE share one transaction: the rest fail on
      // the non-active status instead of overwriting it.
      assert.equal(successes, 1, `exactly 1 deprecate should succeed, got ${successes}`);
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
        const total = store.db.prepare('SELECT count(*) AS c FROM memories').get() as { c: number };
        assert.equal(total.c, writerCount + 1, 'all writes should persist');
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
      const incoming = store.db
        .prepare('SELECT count(*) AS c FROM edges WHERE to_id = ?')
        .get(target) as { c: number };
      assert.equal(incoming.c, sourceCount, `target should have ${sourceCount} incoming edges`);
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
        const total = store.db.prepare('SELECT count(*) AS c FROM memories').get() as {
          c: number;
        };
        assert.equal(total.c, racerCount, `expected all ${racerCount} racers to persist`);
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
