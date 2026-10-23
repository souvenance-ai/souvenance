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
  const [modPath, dbPath, op, ...rest] = process.argv.slice(1);
  const mod = await import(modPath);
  let store;
  if (op === 'count') {
    store = mod.Store.open({ dbPath, readOnly: true });
    const r = store.db.prepare('SELECT count(*) AS c FROM memories').get();
    process.stdout.write(String(r.c));
    store.close();
  } else {
    store = mod.Store.open({ dbPath });
    if (op === 'gated-store') {
      const gate = Number.parseInt(rest[0], 10);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
      process.stdout.write(store.store(rest[1]));
    } else if (op === 'store') {
      process.stdout.write(store.store(rest[0]));
    } else if (op === 'link') {
      store.link(rest[0], rest[1], rest[2]);
    } else if (op === 'supersede') {
      process.stdout.write(store.supersede(rest[0], rest[1]));
    } else if (op === 'merge') {
      process.stdout.write(store.merge([rest[0], rest[1]], rest[2]));
    } else if (op === 'deprecate') {
      store.deprecate(rest[0]);
    } else {
      throw new Error('unknown op: ' + op);
    }
    store.close();
  }
`;

interface ChildResult {
  status: number;
  stdout: string;
  stderr: string;
}

function child(dbPath: string, op: string, ...args: string[]): ChildResult {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', CHILD_SCRIPT, STORE_TS, dbPath, op, ...args],
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
    const N = 20;
    const children = Array.from({ length: N }, (_, i) =>
      child(dbPath, 'store', `concurrent memory ${i}`),
    );

    for (const c of children) {
      assert.equal(c.status, 0, `store should succeed, stderr: ${c.stderr}`);
      assert.ok(c.stdout.length > 0, 'store should print an id');
    }

    const store = Store.open({ dbPath });
    try {
      const total = store.db.prepare('SELECT count(*) AS c FROM memories').get() as { c: number };
      assert.equal(total.c, N, `all ${N} memories should be persisted`);
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
      const a = child(dbPath, 'store', 'source memory').stdout;
      const b = child(dbPath, 'store', 'target memory').stdout;

      const N = 10;
      const children = Array.from({ length: N }, () => child(dbPath, 'link', a, b, 'references'));

      for (const c of children) {
        assert.equal(c.status, 0, `link should succeed, stderr: ${c.stderr}`);
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
    const a = child(dbPath, 'store', 'source memory').stdout;
    const b = child(dbPath, 'store', 'target memory').stdout;

    const kinds = ['references', 'constrained-by', 'related', 'documents', 'extends'];
    const children = kinds.map((kind) => child(dbPath, 'link', a, b, kind));

    for (const c of children) {
      assert.equal(c.status, 0, `link should succeed, stderr: ${c.stderr}`);
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
      const original = child(dbPath, 'store', 'original to supersede').stdout;

      const N = 5;
      const children = Array.from({ length: N }, (_, i) =>
        child(dbPath, 'supersede', original, `replacement ${i}`),
      );

      let successes = 0;
      for (const c of children) {
        if (c.status === 0) successes++;
      }

      // The check (active) and the write land in ONE transaction: after the
      // first commits, the others see a superseded memory (or lose the WAL
      // snapshot) and refuse. Exactly one winner.
      assert.equal(successes, 1, `exactly 1 supersede should succeed, got ${successes}`);

      // Verify original is superseded and only 1 replacement exists
      const store = Store.open({ dbPath });
      try {
        const orig = store.db.prepare('SELECT status FROM memories WHERE id = ?').get(original) as {
          status: string;
        };
        assert.equal(orig.status, 'superseded', 'original should be superseded');

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
      const a = child(dbPath, 'store', 'merge candidate A').stdout;
      const b = child(dbPath, 'store', 'merge candidate B').stdout;

      const N = 5;
      const children = Array.from({ length: N }, (_, i) =>
        child(dbPath, 'merge', a, b, `merged result ${i}`),
      );

      let successes = 0;
      for (const c of children) {
        if (c.status === 0) successes++;
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
        assert.equal(statusOf(a), 'merged', 'a should be merged');
        assert.equal(statusOf(b), 'merged', 'b should be merged');

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
      const a = child(dbPath, 'store', 'to be deprecated').stdout;

      const N = 5;
      const children = Array.from({ length: N }, () => child(dbPath, 'deprecate', a));

      let successes = 0;
      for (const c of children) {
        if (c.status === 0) successes++;
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
      child(dbPath, 'store', 'initial memory zero');

      const N_WRITERS = 10;
      const N_READERS = 10;

      // Writers and readers race; readers open read-only and raw-count.
      const writers = Array.from({ length: N_WRITERS }, (_, i) =>
        child(dbPath, 'store', `write ${i}`),
      );
      const readers = Array.from({ length: N_READERS }, () => child(dbPath, 'count'));

      for (const w of writers) {
        assert.equal(w.status, 0, `writer should succeed, stderr: ${w.stderr}`);
      }
      for (const r of readers) {
        assert.equal(r.status, 0, `reader should succeed, stderr: ${r.stderr}`);
        const seen = Number.parseInt(r.stdout, 10);
        // Readers should see at least 1 memory (the initial one)
        assert.ok(seen >= 1, `reader should see at least 1 memory, saw ${seen}`);
      }

      // After all writers complete, total should be exact
      const store = Store.open({ dbPath });
      try {
        const total = store.db.prepare('SELECT count(*) AS c FROM memories').get() as { c: number };
        assert.equal(total.c, N_WRITERS + 1, 'all writes should persist');
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
    const target = child(dbPath, 'store', 'target for links').stdout;

    const N = 10;
    const children = Array.from({ length: N }, (_, i) => child(dbPath, 'store', `source ${i}`));

    // All stores succeeded, collect their ids
    const sourceIds = children.map((c) => {
      assert.equal(c.status, 0, `store should succeed, stderr: ${c.stderr}`);
      return c.stdout;
    });

    // Now link all sources to the target concurrently
    const linkChildren = sourceIds.map((id) => child(dbPath, 'link', id, target, 'references'));

    for (const c of linkChildren) {
      assert.equal(c.status, 0, `link should succeed, stderr: ${c.stderr}`);
    }

    const store = Store.open({ dbPath });
    try {
      const incoming = store.db
        .prepare('SELECT count(*) AS c FROM edges WHERE to_id = ?')
        .get(target) as { c: number };
      assert.equal(incoming.c, N, `target should have ${N} incoming edges`);
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
    const N = 4;
    const gate = Date.now() + 400;
    try {
      const outs = Array.from({ length: N }, (_, i) =>
        child(dbPath, 'gated-store', String(gate), `race ${i}`),
      );
      for (const out of outs) {
        assert.equal(
          out.status,
          0,
          `an open lost the fresh-store race (exit ${out.status}): ${out.stderr}`,
        );
        assert.ok(out.stdout.length > 0, 'each racer should have stored its memory');
      }
      const store = Store.open({ dbPath });
      try {
        const total = store.db.prepare('SELECT count(*) AS c FROM memories').get() as { c: number };
        assert.equal(total.c, N, `expected all ${N} racers to persist`);
      } finally {
        store.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
