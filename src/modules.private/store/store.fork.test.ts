import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { Store } from './store.ts';

function tempStore(): { store: Store; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-fork-'));
  const store = Store.open({ dbPath: join(dir, 'memory.db') });
  return {
    store,
    dir,
    cleanup: () => {
      try {
        store.close();
      } catch {
        // already closed by the test itself (e.g. the read-only fork test)
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('fork is an exact copy — nothing added, nothing missing', () => {
  const { store, dir, cleanup } = tempStore();
  try {
    const alpha = store.store('The alpha memory: FTS needle kiwi.', { metadata: { kind: 'note' } });
    const beta = store.store('The beta memory: another doc for the graph.', {
      metadata: { kind: 'note' },
    });
    store.link(alpha, beta, 'references');
    const summary = store.store('An old handoff summary from the origin.', {
      metadata: { kind: 'summary' },
      summary: 'the old handoff',
    });
    store.setHot(summary, true);

    const result = store.fork(join(dir, 'fork.db'));
    assert.equal(result.memories, 3);
    assert.equal(result.edges, 1);
    assert.equal(result.path, join(dir, 'fork.db'));
    assert.equal(existsSync(result.path), true);

    const child = Store.open({ dbPath: result.path });
    try {
      // The copy adds NOTHING: no provenance memory, the rows are exactly
      // the origin's — a fork that should know its origin gets told by its
      // forker, via memory store in the child.
      const all = child.list({ includeLegacy: true, limit: 100 });
      assert.equal(all.length, 3);
      assert.equal(child.list({ where: "metadata->>'$.kind' = 'summary'", limit: 10 }).length, 1);
      // The authored summary and the earned hot flag travel with the copy.
      const served = child.get(summary)!;
      assert.equal(served.summary, 'the old handoff');
      assert.equal(served.hot, true);
      // FTS index travels with the copy.
      const hits = child.search('kiwi');
      assert.equal(hits.length, 1);
      assert.equal(hits[0]!.id, alpha);
    } finally {
      child.close();
    }
  } finally {
    cleanup();
  }
});

test('fork refuses an existing target without force; force gives the exact copy again', () => {
  const { store, dir, cleanup } = tempStore();
  try {
    const target = join(dir, 'fork.db');
    store.store('A memory worth keeping.', { metadata: { kind: 'note' } });
    store.fork(target);
    assert.throws(() => store.fork(target), /already exists/);

    // The refresh path: force wipes the old file (and its WAL sidecars)
    // and snapshots the current state — still exactly the origin's rows.
    store.store('Added before the refresh.', { metadata: { kind: 'note' } });
    const result = store.fork(target, { force: true });
    const child = Store.open({ dbPath: result.path });
    try {
      assert.equal(child.list({ includeLegacy: true, limit: 100 }).length, 2);
      assert.equal(child.list({ where: "metadata->>'$.kind' = 'summary'", limit: 10 }).length, 0);
    } finally {
      child.close();
    }
  } finally {
    cleanup();
  }
});

test('the child is an individual: writes to either side never touch the other', () => {
  const { store, dir, cleanup } = tempStore();
  try {
    store.store('Origin memory.', { metadata: { kind: 'note' } });
    const result = store.fork(join(dir, 'fork.db'));

    const child = Store.open({ dbPath: result.path });
    try {
      child.store("The child's own lived experience.", { metadata: { kind: 'note' } });
      child.deprecate(child.list({ where: "metadata->>'$.kind' = 'note'", limit: 1 })[0]!.id);
    } finally {
      child.close();
    }
    // Parent unchanged: still one note + no deprecated statuses.
    const notes = store.list({ where: "metadata->>'$.kind' = 'note'", limit: 10 });
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.status, 'active');
    // And a later parent write never appears in the already-born child.
    store.store('Born after the fork.', { metadata: { kind: 'note' } });
    const child2 = Store.open({ dbPath: result.path });
    try {
      assert.equal(
        child2
          .list({ limit: 100 })
          .some((memory) => memory.content.includes('Born after the fork')),
        false,
      );
    } finally {
      child2.close();
    }
  } finally {
    cleanup();
  }
});

test('fork works from a read-only open — an archive is forked without waking it', () => {
  const { store, dir, cleanup } = tempStore();
  try {
    store.store('Archived memory.', { metadata: { kind: 'note' } });
    store.close();

    const archive = Store.open({ dbPath: join(dir, 'memory.db'), readOnly: true });
    try {
      const result = archive.fork(join(dir, 'reborn.db'));
      assert.equal(result.memories, 1);
      const child = Store.open({ dbPath: result.path });
      try {
        // Exact copy: the one inherited memory, nothing added.
        assert.equal(child.list({ limit: 100 }).length, 1);
      } finally {
        child.close();
      }
    } finally {
      archive.close();
    }
  } finally {
    cleanup();
  }
});

test('fork captures WAL-committed writes immediately — no checkpoint needed', () => {
  const { store, dir, cleanup } = tempStore();
  try {
    store.store('Committed into the WAL, copied anyway.', { metadata: { kind: 'note' } });
    const result = store.fork(join(dir, 'fork.db'));
    const child = Store.open({ dbPath: result.path });
    try {
      const found = child
        .list({ limit: 100 })
        .some((memory) => memory.content.includes('Committed into the WAL'));
      assert.equal(found, true);
    } finally {
      child.close();
    }
  } finally {
    cleanup();
  }
});
