import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SQLInputValue } from 'node:sqlite';
import { test } from 'vitest';
import { Store } from './store.ts';

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-test-'));
  const store = Store.open({ dbPath: join(dir, 'memory.db') });
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function row<T>(store: Store, sql: string, ...params: SQLInputValue[]): T {
  return store.db.prepare(sql).get(...params) as T;
}

function count(store: Store, sql: string, ...params: SQLInputValue[]): number {
  return row<{ c: number }>(store, sql, ...params).c;
}

function uuidRegex(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

interface RawMemory {
  id: string;
  content: string;
  metadata: string | null;
  created_at: string;
  status: string;
  hot: number;
}

function memoryRow(store: Store, id: string): RawMemory {
  return row<RawMemory>(store, 'SELECT * FROM memories WHERE id = ?', id);
}

interface RawEdge {
  from_id: string;
  to_id: string;
  kind: string;
  metadata: string | null;
  created_at: string;
}

function edgesOf(store: Store, id: string): RawEdge[] {
  return store.db
    .prepare('SELECT * FROM edges WHERE from_id = ? ORDER BY kind')
    .all(id) as unknown as RawEdge[];
}

// --- store -----------------------------------------------------------------

test('store: inserts a memory with UUID id, metadata, born cold and active', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('hello world', { metadata: { tags: ['a'] } });
    assert.ok(uuidRegex(id), `id should be a UUID v4, got: ${id}`);

    const m = memoryRow(store, id);
    assert.equal(m.id, id);
    assert.equal(m.content, 'hello world');
    assert.deepEqual(JSON.parse(m.metadata!), { tags: ['a'] });
    assert.equal(m.status, 'active');
    assert.equal(m.hot, 0, 'a memory is born cold — the flag is earned via setHot');
  } finally {
    cleanup();
  }
});

test('store: works without metadata', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('no metadata here');
    const m = memoryRow(store, id);
    assert.equal(m.content, 'no metadata here');
    assert.equal(m.metadata, null);
  } finally {
    cleanup();
  }
});

test('store: throws on empty content', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.store(''), /content must be non-empty/);
  } finally {
    cleanup();
  }
});

test('store: FTS index stays in sync after insert', () => {
  const { store, cleanup } = tempStore();
  try {
    store.store('the quick brown fox');
    const fts = count(
      store,
      'SELECT count(*) as c FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?',
      'fox',
    );
    assert.equal(fts, 1);
  } finally {
    cleanup();
  }
});

test('store: relations create the outgoing edges in the same call', () => {
  const { store, cleanup } = tempStore();
  try {
    const target = store.store('the referenced decision', { metadata: { kind: 'decision' } });
    const id = store.store('# Decision: the new one\n\nOne gesture, no store-then-link.', {
      metadata: { kind: 'decision' },
      relations: [
        { to: target, kind: 'references' },
        { to: target, kind: 'extends' },
      ],
    });
    const edges = edgesOf(store, id);
    assert.deepEqual(
      edges.map((e) => `${e.kind}->${e.to_id}`),
      [`extends->${target}`, `references->${target}`],
    );
    // The target's incoming side sees the edges too.
    assert.equal(count(store, 'SELECT count(*) as c FROM edges WHERE to_id = ?', target), 2);
  } finally {
    cleanup();
  }
});

test('store: an invalid relation target refuses and NOTHING lands (atomic write)', () => {
  const { store, cleanup } = tempStore();
  try {
    const ghost = '00000000-0000-4000-8000-000000000009';
    assert.throws(
      () => store.store('doomed memory', { relations: [{ to: ghost, kind: 'references' }] }),
      new RegExp(`memory not found: ${ghost}`),
    );
    assert.equal(
      count(store, 'SELECT count(*) as c FROM memories'),
      0,
      'the memory and its edges rolled back together',
    );
  } finally {
    cleanup();
  }
});

test('store: an empty relation kind is refused', () => {
  const { store, cleanup } = tempStore();
  try {
    const target = store.store('target');
    assert.throws(
      () => store.store('doomed memory', { relations: [{ to: target, kind: '' }] }),
      /kind must be non-empty/,
    );
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 1);
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('store: a self-edge through the one-gesture path is a construction impossibility', () => {
  const { store, cleanup } = tempStore();
  try {
    // The relations target must exist BEFORE the call (validated per edge),
    // and the new memory's id is generated inside it — a store-executed
    // self-edge cannot exist. The only self-edge path is the link verb's,
    // covered by the doctor's self_edges check (#13). Asserted here as
    // speaker for the invariant: a missing target is refused, not smuggled in.
    const ghost = '00000000-0000-4000-8000-000000000007';
    assert.throws(
      () => store.store('self-edge attempt', { relations: [{ to: ghost, kind: 'references' }] }),
      /memory not found/,
    );
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 0);
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

// --- link ------------------------------------------------------------------

test('link: creates a typed directed edge', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');

    const e = row<RawEdge>(store, 'SELECT * FROM edges');
    assert.equal(e.from_id, a);
    assert.equal(e.to_id, b);
    assert.equal(e.kind, 'references');
    assert.equal(e.metadata, null);
  } finally {
    cleanup();
  }
});

test('link: stores metadata as JSON', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references', { metadata: { note: 0.9 } });

    const e = row<{ metadata: string | null }>(store, 'SELECT metadata FROM edges');
    assert.deepEqual(JSON.parse(e.metadata!), { note: 0.9 });
  } finally {
    cleanup();
  }
});

test('link: duplicate (same from/to/kind) is ignored (idempotent)', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');
    store.link(a, b, 'references');

    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 1);
  } finally {
    cleanup();
  }
});

test('link: allows different kinds between same pair', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');
    store.link(a, b, 'extends');

    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 2);
  } finally {
    cleanup();
  }
});

test('link: throws on unknown from_id', () => {
  const { store, cleanup } = tempStore();
  try {
    const b = store.store('memory b');
    assert.throws(() => store.link('nope', b, 'references'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('link: throws on unknown to_id', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    assert.throws(() => store.link(a, 'nope', 'references'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('link: throws on empty kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    assert.throws(() => store.link(a, b, ''), /kind must be non-empty/);
  } finally {
    cleanup();
  }
});

// --- unlink ----------------------------------------------------------------

test('unlink: removes the single edge on a pair without kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');
    store.unlink(a, b);
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('unlink: explicit kind removes exactly that edge among several', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');
    store.link(a, b, 'extends');
    store.unlink(a, b, 'extends');
    const kinds = (
      store.db.prepare('SELECT kind FROM edges ORDER BY kind').all() as { kind: string }[]
    ).map((e) => e.kind);
    assert.deepEqual(kinds, ['references']);
  } finally {
    cleanup();
  }
});

test('unlink: refuses an ambiguous pair with the candidate kinds', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');
    store.link(a, b, 'extends');
    assert.throws(
      () => store.unlink(a, b),
      /ambiguous: 2 edges between .* and .*, pass --kind: extends, references/,
    );
    // The refusal is not destructive: both edges survive.
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 2);
  } finally {
    cleanup();
  }
});

test('unlink: not found on an absent edge', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    assert.throws(() => store.unlink(a, b), /edge not found: .* -> .*/);
  } finally {
    cleanup();
  }
});

test('unlink: names reverse-direction edges to catch transposed ids', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(b, a, 'references');
    assert.throws(
      () => store.unlink(a, b),
      /edge not found: .* -> .*; edges exist in the reverse direction: .* -> .* \(references\)/,
    );
    // The reverse pair itself unlinks cleanly.
    store.unlink(b, a, 'references');
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('unlink: names the missing endpoint before consulting edges', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    assert.throws(() => store.unlink(a, 'nope'), /memory not found: nope/);
    assert.throws(() => store.unlink('nope', a), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('unlink: throws on empty explicit kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');
    assert.throws(() => store.unlink(a, b, ''), /kind must be non-empty/);
  } finally {
    cleanup();
  }
});

test('unlink: refuses when an endpoint is not active — corrections among the living', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.link(a, b, 'references');

    store.deprecate(b);
    assert.throws(() => store.unlink(a, b), /cannot unlink a memory with status 'deprecated'/);
    // The refusal is not destructive: the edge survives.
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 1);

    store.supersede(a, 'memory a revised');
    assert.throws(
      () => store.unlink(a, b, 'references'),
      /cannot unlink a memory with status 'superseded'/,
    );
  } finally {
    cleanup();
  }
});

test('unlink: the supersedes bridge is untouchable by construction', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('# Decision: v1', { metadata: { kind: 'decision' } });
    const newId = store.supersede(oldId, '# Decision: v2');
    assert.throws(
      () => store.unlink(oldId, newId),
      /cannot unlink a memory with status 'superseded'/,
    );
  } finally {
    cleanup();
  }
});

// --- supersede -------------------------------------------------------------

test('supersede: stores new memory, links old, marks old as superseded', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world');
    const newId = store.supersede(oldId, 'hello universe');

    assert.ok(uuidRegex(newId), 'new id should be a UUID');

    const oldMem = memoryRow(store, oldId);
    assert.equal(oldMem.status, 'superseded');

    const newMem = memoryRow(store, newId);
    assert.equal(newMem.content, 'hello universe');
    assert.equal(newMem.status, 'active');

    const bridge = row<{ from_id: string; to_id: string; kind: string }>(
      store,
      "SELECT from_id, to_id, kind FROM edges WHERE kind = 'supersedes'",
    );
    assert.equal(bridge.from_id, oldId);
    assert.equal(bridge.to_id, newId);
  } finally {
    cleanup();
  }
});

test('supersede: FTS stays in sync (old excluded from the active surface, new findable)', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world');
    store.supersede(oldId, 'hello universe');

    const ftsActive = (query: string): number =>
      count(
        store,
        `SELECT count(*) as c FROM memories_fts f JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ? AND m.status = 'active'`,
        query,
      );
    const ftsAll = (query: string): number =>
      count(
        store,
        'SELECT count(*) as c FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?',
        query,
      );

    assert.equal(ftsActive('world'), 0, 'the superseded memory leaves the active surface');
    assert.equal(ftsAll('world'), 1, 'the row itself stays in the index for full-history reads');
    assert.equal(ftsActive('universe'), 1);
  } finally {
    cleanup();
  }
});

test('supersede: stores metadata on the new memory', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world');
    const newId = store.supersede(oldId, 'hello universe', {
      metadata: { tags: ['greeting'] },
    });

    assert.deepEqual(JSON.parse(memoryRow(store, newId).metadata!), { tags: ['greeting'] });
  } finally {
    cleanup();
  }
});

test('supersede: inherits kind and tags from the old memory when metadata omitted', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world', {
      metadata: { kind: 'note', tags: ['a', 'b'], session: 2 },
    });
    const newId = store.supersede(oldId, 'hello universe');

    // kind and tags are structural and carry; contextual keys do not.
    assert.deepEqual(JSON.parse(memoryRow(store, newId).metadata!), {
      kind: 'note',
      tags: ['a', 'b'],
    });
  } finally {
    cleanup();
  }
});

test('supersede: explicit metadata is used verbatim, no inherit', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world', {
      metadata: { kind: 'note', tags: ['a'] },
    });
    const newId = store.supersede(oldId, 'hello universe', {
      metadata: { kind: 'decision' },
    });

    assert.deepEqual(JSON.parse(memoryRow(store, newId).metadata!), { kind: 'decision' });
  } finally {
    cleanup();
  }
});

test('supersede: kindless old memory yields kindless successor', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world');
    const newId = store.supersede(oldId, 'hello universe');

    assert.equal(memoryRow(store, newId).metadata, null);
  } finally {
    cleanup();
  }
});

test('supersede: throws on unknown old id', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.supersede('nope', 'new content'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('supersede: throws on empty content', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('old content');
    assert.throws(() => store.supersede(oldId, ''), /content must be non-empty/);
  } finally {
    cleanup();
  }
});

test('supersede: throws when old memory is not active', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('old content');
    store.deprecate(oldId);
    assert.throws(
      () => store.supersede(oldId, 'new content'),
      /cannot supersede a memory with status 'deprecated'/,
    );
  } finally {
    cleanup();
  }
});

test('supersede: the head inherits the source hot flag, the source cools', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('a curated memory');
    store.setHot(oldId, true);
    const newId = store.supersede(oldId, 'the revision');

    assert.equal(memoryRow(store, newId).hot, 1, 'the head takes the flag over');
    assert.equal(memoryRow(store, oldId).hot, 0, 'the source cools with its status');
  } finally {
    cleanup();
  }
});

test('supersede: a cold source yields a cold head', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('a plain memory');
    const newId = store.supersede(oldId, 'the revision');
    assert.equal(memoryRow(store, newId).hot, 0);
  } finally {
    cleanup();
  }
});

test('supersede: relations attach to the NEW memory, supersedes edge still lands', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('# Decision: v1', { metadata: { kind: 'decision' } });
    const other = store.store('a live target', { metadata: { kind: 'note' } });
    const newId = store.supersede(oldId, '# Decision: v2', {
      relations: [{ to: other, kind: 'references' }],
    });
    const out = edgesOf(store, newId);
    assert.deepEqual(
      out.map((e) => `${e.kind}->${e.to_id}`),
      [`references->${other}`],
    );
    // The old memory keeps exactly its supersedes bridge — the bridge
    // leaves the OLD memory; the head carries only its authored claims.
    const bridge = edgesOf(store, oldId);
    assert.deepEqual(
      bridge.map((e) => `${e.kind}->${e.to_id}`),
      [`supersedes->${newId}`],
    );
    assert.equal(memoryRow(store, oldId).status, 'superseded');
  } finally {
    cleanup();
  }
});

test('supersede: an invalid relation target rolls the whole revision back', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('# Decision: v1', { metadata: { kind: 'decision' } });
    const ghost = '00000000-0000-4000-8000-000000000008';
    assert.throws(
      () =>
        store.supersede(oldId, '# Decision: v2', {
          relations: [{ to: ghost, kind: 'references' }],
        }),
      new RegExp(`memory not found: ${ghost}`),
    );
    // Old memory untouched: still active, no supersedes edge, no successor.
    assert.equal(memoryRow(store, oldId).status, 'active');
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 1);
  } finally {
    cleanup();
  }
});

test('supersede: the head inherits the source outgoing edges verbatim', () => {
  const { store, cleanup } = tempStore();
  try {
    const targetA = store.store('target A', { metadata: { kind: 'note' } });
    const targetB = store.store('target B', { metadata: { kind: 'note' } });
    const oldId = store.store('# Decision: v1', {
      metadata: { kind: 'decision' },
      relations: [
        { to: targetA, kind: 'references' },
        { to: targetB, kind: 'extends' },
      ],
    });
    const newId = store.supersede(oldId, '# Decision: v2 (content)');
    const inherited = edgesOf(store, newId).filter((e) => e.kind !== 'supersedes');
    // The two authored claims carried over, ROW VERBATIM (kind, metadata,
    // created_at) — the head claims what v1 claimed.
    assert.deepEqual(inherited.map((e) => [e.kind, e.to_id]).sort(), [
      ['extends', targetB],
      ['references', targetA],
    ]);
    const sourceRows = edgesOf(store, oldId).filter((e) => e.kind !== 'supersedes');
    for (const copy of inherited) {
      const src = sourceRows.find((r) => r.kind === copy.kind && r.to_id === copy.to_id);
      assert.ok(src, 'each copied edge has a source row');
      assert.equal(
        copy.created_at,
        src!.created_at,
        'verbatim copy carries the original timestamp',
      );
      assert.equal(copy.metadata, src!.metadata);
    }
    // Addition-only: the old memory KEEPS its edges (provenance), plus the
    // new supersedes bridge. The head is not isolated — the edge set is
    // intact (the doctor's isolated_active check verifies this in #13).
    assert.equal(edgesOf(store, oldId).length, 3);
    assert.equal(edgesOf(store, newId).length, 2);
  } finally {
    cleanup();
  }
});

test('supersede: explicit relations REPLACE the inherited set verbatim', () => {
  const { store, cleanup } = tempStore();
  try {
    const targetA = store.store('target A', { metadata: { kind: 'note' } });
    const targetC = store.store('target C', { metadata: { kind: 'note' } });
    const oldId = store.store('# Decision: v1', {
      metadata: { kind: 'decision' },
      relations: [{ to: targetA, kind: 'references' }],
    });
    const newId = store.supersede(oldId, '# Decision: v2 — claims corrected', {
      relations: [{ to: targetC, kind: 'references' }],
    });
    const out = edgesOf(store, newId).filter((e) => e.kind !== 'supersedes');
    // Verbatim wins over inheritance, the way explicit metadata
    // overrides kind/tags inheritance.
    assert.deepEqual(
      out.map((e) => `${e.kind}->${e.to_id}`),
      [`references->${targetC}`],
    );
    // The old memory keeps its authored claims AND the bridge.
    assert.equal(edgesOf(store, oldId).length, 2);
  } finally {
    cleanup();
  }
});

test('supersede: a corrupted orphan SOURCE edge refuses the revision precisely', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('# Decision: v1', { metadata: { kind: 'decision' } });
    const ghost = '00000000-0000-4000-8000-000000000003';
    store.db.exec('PRAGMA foreign_keys = OFF');
    store.db
      .prepare(
        'INSERT INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(oldId, ghost, 'references', null, new Date().toISOString());
    store.db.exec('PRAGMA foreign_keys = ON');
    // Refuse-don't-hide: the missing target is named precisely, and the
    // ROLLBACK keeps the old memory active and unbridged.
    assert.throws(
      () => store.supersede(oldId, '# Decision: v2'),
      new RegExp(`memory not found: ${ghost}`),
    );
    assert.equal(memoryRow(store, oldId).status, 'active');
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 1);
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 1);
  } finally {
    cleanup();
  }
});

// --- deprecate -------------------------------------------------------------

test('deprecate: marks a memory as deprecated and cools it', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('to be deprecated');
    store.setHot(id, true);
    store.deprecate(id);

    const m = memoryRow(store, id);
    assert.equal(m.status, 'deprecated');
    assert.equal(m.hot, 0, 'a non-active memory is never hot');
  } finally {
    cleanup();
  }
});

test('deprecate: throws on unknown id', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.deprecate('nope'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('deprecate: throws when memory is not active', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('content');
    store.deprecate(id);
    assert.throws(() => store.deprecate(id), /cannot deprecate a memory with status 'deprecated'/);
  } finally {
    cleanup();
  }
});

// --- merge -----------------------------------------------------------------

test('merge: combines memories, marks originals as merged, bridges them', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    const mergedId = store.merge([a, b], 'combined content');

    assert.ok(uuidRegex(mergedId), 'merged id should be a UUID');

    const merged = memoryRow(store, mergedId);
    assert.equal(merged.content, 'combined content');
    assert.equal(merged.status, 'active');

    assert.equal(memoryRow(store, a).status, 'merged');
    assert.equal(memoryRow(store, b).status, 'merged');

    const bridges = edgesOf(store, a).concat(edgesOf(store, b));
    assert.deepEqual(bridges.map((e) => `${e.kind}->${e.to_id}`).sort(), [
      `merges->${mergedId}`,
      `merges->${mergedId}`,
    ]);
  } finally {
    cleanup();
  }
});

test('merge: stores metadata on the merged memory', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    const mergedId = store.merge([a, b], 'combined', {
      metadata: { tags: ['merged'] },
    });

    assert.deepEqual(JSON.parse(memoryRow(store, mergedId).metadata!), { tags: ['merged'] });
  } finally {
    cleanup();
  }
});

test('merge: inherits kind when every source agrees, unions tags', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('alpha', { metadata: { kind: 'note', tags: ['x'] } });
    const b = store.store('beta', { metadata: { kind: 'note', tags: ['y', 'x'] } });
    const id = store.merge([a, b], 'alpha beta combined');

    assert.deepEqual(JSON.parse(memoryRow(store, id).metadata!), {
      kind: 'note',
      tags: ['x', 'y'],
    });
  } finally {
    cleanup();
  }
});

test('merge: divergent kinds are not inherited; tags still union', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('alpha', { metadata: { kind: 'note', tags: ['x'] } });
    const b = store.store('beta', { metadata: { kind: 'decision', tags: ['y'] } });
    const id = store.merge([a, b], 'alpha beta combined');

    assert.deepEqual(JSON.parse(memoryRow(store, id).metadata!), { tags: ['x', 'y'] });
  } finally {
    cleanup();
  }
});

test('merge: the hot flag unions across sources, sources cool', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('hot memory a');
    const b = store.store('cold memory b');
    store.setHot(a, true);
    const mergedId = store.merge([a, b], 'the fusion');

    assert.equal(memoryRow(store, mergedId).hot, 1, 'one hot source makes the fusion hot');
    assert.equal(memoryRow(store, a).hot, 0, 'the source cools with its status');
    assert.equal(memoryRow(store, b).hot, 0);
  } finally {
    cleanup();
  }
});

test('merge: all-cold sources yield a cold fusion', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    const mergedId = store.merge([a, b], 'the fusion');
    assert.equal(memoryRow(store, mergedId).hot, 0);
  } finally {
    cleanup();
  }
});

test('merge: throws on fewer than 2 ids', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('only one');
    assert.throws(() => store.merge([a], 'content'), /merge requires at least 2 memories/);
  } finally {
    cleanup();
  }
});

test('merge: throws on duplicate ids', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    assert.throws(() => store.merge([a, a], 'content'), /duplicate id in merge/);
  } finally {
    cleanup();
  }
});

test('merge: throws on unknown id', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    assert.throws(() => store.merge([a, 'nope'], 'content'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('merge: throws on empty content', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    assert.throws(() => store.merge([a, b], ''), /content must be non-empty/);
  } finally {
    cleanup();
  }
});

test('merge: throws when an original is not active', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    const b = store.store('memory b');
    store.deprecate(b);
    assert.throws(
      () => store.merge([a, b], 'content'),
      /cannot merge a memory with status 'deprecated'/,
    );
  } finally {
    cleanup();
  }
});

// --- setHot ----------------------------------------------------------------

test('setHot: flags an active memory, and unflags it', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('a curated memory');
    store.setHot(id, true);
    assert.equal(memoryRow(store, id).hot, 1);
    store.setHot(id, false);
    assert.equal(memoryRow(store, id).hot, 0);
  } finally {
    cleanup();
  }
});

test('setHot: throws on unknown id', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.setHot('nope', true), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('setHot: only an active memory can be hot', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('content');
    store.deprecate(id);
    assert.throws(() => store.setHot(id, true), /cannot hot a memory with status 'deprecated'/);

    const oldId = store.store('a decision');
    const newId = store.supersede(oldId, 'the revision');
    assert.throws(() => store.setHot(oldId, true), /cannot hot a memory with status 'superseded'/);
    // The head itself is fine.
    store.setHot(newId, true);
    assert.equal(memoryRow(store, newId).hot, 1);
  } finally {
    cleanup();
  }
});
