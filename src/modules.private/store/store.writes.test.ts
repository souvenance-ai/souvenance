import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'vitest';
import { type StoreOptions, Store } from './store.ts';

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

/**
 * A raw probe: a SECOND connection on the store's file — the store's own
 * connection is `#db`-private by design (no in-process raw access), and a
 * raw reader is exactly the outside-the-library vantage the store must
 * survive.
 */
function probe(store: Store): DatabaseSync {
  const db = new DatabaseSync(store.dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

function row<T>(store: Store, sql: string, ...params: SQLInputValue[]): T {
  const db = probe(store);
  try {
    return db.prepare(sql).get(...params) as T;
  } finally {
    db.close();
  }
}

function count(store: Store, sql: string, ...params: SQLInputValue[]): number {
  return row<{ c: number }>(store, sql, ...params).c;
}

function uuidRegex(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

interface RawMemory {
  readonly id: string;
  readonly content: string;
  readonly kind: string;
  readonly summary: string | null;
  readonly metadata: string | null;
  readonly created_at: string;
  readonly status: string;
}

function memoryRow(store: Store, id: string): RawMemory {
  return row<RawMemory>(store, 'SELECT * FROM memories WHERE id = ?', id);
}

interface RawEdge {
  readonly from_id: string;
  readonly to_id: string;
  readonly kind: string;
  readonly metadata: string | null;
  readonly created_at: string;
}

function edgesOf(store: Store, id: string): RawEdge[] {
  const db = probe(store);
  try {
    return db
      .prepare('SELECT * FROM edges WHERE from_id = ? ORDER BY kind')
      .all(id) as unknown as RawEdge[];
  } finally {
    db.close();
  }
}

// --- store -----------------------------------------------------------------

test('store: inserts a memory with UUID id, kind, metadata, born active and cold', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('hello world', { kind: 'note', metadata: { tag: 'a' } });
    assert.ok(uuidRegex(id), `id should be a UUID v4, got: ${id}`);

    const memory = memoryRow(store, id);
    assert.equal(memory.id, id);
    assert.equal(memory.content, 'hello world');
    assert.equal(memory.kind, 'note', 'kind is a column — the required classification');
    assert.deepEqual(JSON.parse(memory.metadata!), { tag: 'a' });
    assert.equal(memory.status, 'active', 'curation is a status, earned via setHot (#38)');
    assert.equal(memory.summary, null, 'a short content owes no summary');
  } finally {
    cleanup();
  }
});

test('store: kind is required — a kind-less memory does not exist', () => {
  const { store, cleanup } = tempStore();
  try {
    // The runtime guard exists for the JS caller TS cannot see: play it by
    // erasing the type system's view of the required property.
    const kindless = { metadata: { tag: 'a' } } as unknown as StoreOptions;
    assert.throws(() => store.store('doomed memory', kindless), /kind is required: pass kind/);
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 0);
  } finally {
    cleanup();
  }
});

test('store: metadata values refuse arrays — the filter cannot ask for them (#51)', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(
      () =>
        store.store('doomed memory', {
          kind: 'note',
          metadata: { tags: ['a', 'b'] },
        } as unknown as Parameters<Store['store']>[1]),
      /may not be arrays.*#40, #51.*refused: \$.tags/,
    );
    assert.throws(
      () =>
        store.store('doomed memory', {
          kind: 'note',
          metadata: { deep: [['x']] },
        } as unknown as Parameters<Store['store']>[1]),
      /refused: \$.deep/,
    );
  } finally {
    cleanup();
  }
});

test('store: metadata values refuse null and non-finite numbers — omit the key (#51)', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(
      () =>
        store.store('doomed memory', {
          kind: 'note',
          metadata: { owner: null },
        } as unknown as Parameters<Store['store']>[1]),
      /may not be null.*omit \$\.owner/,
    );
    assert.throws(
      () =>
        store.store('doomed memory', {
          kind: 'note',
          metadata: { rank: NaN },
        } as unknown as Parameters<Store['store']>[1]),
      /non-finite numbers.*JSON\.stringify.*omit \$\.rank/,
    );
    assert.throws(
      () =>
        store.store('doomed memory', {
          kind: 'note',
          metadata: { tree: { limit: Infinity } },
        } as unknown as Parameters<Store['store']>[1]),
      /omit \$\.tree\.limit/,
    );
  } finally {
    cleanup();
  }
});

test('store: nested objects of scalar leaves author fine — the filter walks them', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('nested metadata', {
      kind: 'note',
      metadata: { tree: { ab: 9 }, mark: 'x' },
    });
    const memory = store.get(id);
    assert.deepEqual(memory!.metadata, { tree: { ab: 9 }, mark: 'x' });
  } finally {
    cleanup();
  }
});

test('store: metadata.kind is refused with the teaching error — one spelling', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(
      () => store.store('doomed memory', { kind: 'note', metadata: { kind: 'note' } }),
      /kind is a column — pass kind, not metadata\.kind/,
    );
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 0);
  } finally {
    cleanup();
  }
});

test('store: works without metadata', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('no metadata here', { kind: 'note' });
    const memory = memoryRow(store, id);
    assert.equal(memory.content, 'no metadata here');
    assert.equal(memory.kind, 'note');
    assert.equal(memory.metadata, null);
  } finally {
    cleanup();
  }
});

test('store: throws on empty content', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.store('', { kind: 'note' }), /content must be non-empty/);
  } finally {
    cleanup();
  }
});

test('store: FTS index stays in sync after insert', () => {
  const { store, cleanup } = tempStore();
  try {
    store.store('the quick brown fox', { kind: 'note' });
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
    const target = store.store('the referenced decision', { kind: 'decision' });
    const id = store.store('# Decision: the new one\n\nOne gesture, no store-then-link.', {
      kind: 'decision',
      relations: [
        { to: target, kind: 'references' },
        { to: target, kind: 'extends' },
      ],
    });
    const edges = edgesOf(store, id);
    assert.deepEqual(
      edges.map((edge) => `${edge.kind}->${edge.to_id}`),
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
      () =>
        store.store('doomed memory', {
          kind: 'note',
          relations: [{ to: ghost, kind: 'references' }],
        }),
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
    const target = store.store('target', { kind: 'note' });
    assert.throws(
      () =>
        store.store('doomed memory', {
          kind: 'note',
          relations: [{ to: target, kind: '' }],
        }),
      /kind must be non-empty/,
    );
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 1);
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('link: a self-edge is refused — corrections name two different memories', () => {
  const { store, cleanup } = tempStore();
  try {
    // The one-gesture paths are a construction impossibility: the new
    // memory's id is generated inside the call, so relations cannot point
    // at it. link() is the only self-edge door, and it refuses at the gate
    // (refuse-don't-hide): an edge from a memory to itself names no
    // relationship, so the store never lets one land.
    const id = store.store('the only candidate self-source', { kind: 'note' });
    assert.throws(() => store.link(id, id, 'references'), /self-edge refused/);
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);

    // The refusal is not destructive: the memory still exists and accepts
    // a real edge to another memory.
    const other = store.store('another memory', { kind: 'note' });
    store.link(id, other, 'references');
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 1);
  } finally {
    cleanup();
  }
});

// --- link ------------------------------------------------------------------

test('link: creates a typed directed edge', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    store.link(a, b, 'references');

    const edge = row<RawEdge>(store, 'SELECT * FROM edges');
    assert.equal(edge.from_id, a);
    assert.equal(edge.to_id, b);
    assert.equal(edge.kind, 'references');
    assert.equal(edge.metadata, null);
  } finally {
    cleanup();
  }
});

test('link: stores metadata as JSON', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    store.link(a, b, 'references', { metadata: { note: 0.9 } });

    const edge = row<{ metadata: string | null }>(store, 'SELECT metadata FROM edges');
    assert.deepEqual(JSON.parse(edge.metadata!), { note: 0.9 });
  } finally {
    cleanup();
  }
});

test('link: duplicate (same from/to/kind) is ignored (idempotent)', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
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
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
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
    const b = store.store('memory b', { kind: 'note' });
    assert.throws(() => store.link('nope', b, 'references'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('link: throws on unknown to_id', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    assert.throws(() => store.link(a, 'nope', 'references'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('link: throws on empty kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    assert.throws(() => store.link(a, b, ''), /kind must be non-empty/);
  } finally {
    cleanup();
  }
});

// --- unlink ----------------------------------------------------------------

test('unlink: removes the single edge on a pair without kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
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
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    store.link(a, b, 'references');
    store.link(a, b, 'extends');
    store.unlink(a, b, 'extends');
    // The unlink is a real edge removal — the kind ledger reflects it.
    assert.deepEqual(store.stats().edges_by_kind, { references: 1 });
  } finally {
    cleanup();
  }
});

test('unlink: refuses an ambiguous pair with the candidate kinds', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
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
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    assert.throws(() => store.unlink(a, b), /edge not found: .* -> .*/);
  } finally {
    cleanup();
  }
});

test('unlink: names reverse-direction edges to catch transposed ids', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
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
    const a = store.store('memory a', { kind: 'note' });
    assert.throws(() => store.unlink(a, 'nope'), /memory not found: nope/);
    assert.throws(() => store.unlink('nope', a), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('unlink: throws on empty explicit kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    store.link(a, b, 'references');
    assert.throws(() => store.unlink(a, b, ''), /kind must be non-empty/);
  } finally {
    cleanup();
  }
});

test('unlink: accepts a hot endpoint — corrections among the living (#38)', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    store.link(a, b, 'references');
    store.setHot(b, true);
    // A hot endpoint is living: the correction goes through.
    store.unlink(a, b);
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('unlink: refuses when an endpoint is not living — corrections among the living', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
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
    const oldId = store.store('# Decision: v1', { kind: 'decision' });
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

test('unlink: the merges bridge is untouchable like the supersedes one', () => {
  const { store, cleanup } = tempStore();
  try {
    const sourceA = store.store('memory a', { kind: 'note' });
    const sourceB = store.store('memory b', { kind: 'note' });
    const fusion = store.merge([sourceA, sourceB], 'the fusion');
    assert.throws(
      () => store.unlink(sourceA, fusion),
      /cannot unlink a memory with status 'merged'/,
    );
  } finally {
    cleanup();
  }
});

test('supersede: stores new memory, links old, marks old as superseded', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world', { kind: 'note' });
    const newId = store.supersede(oldId, 'hello universe');

    assert.ok(uuidRegex(newId), 'new id should be a UUID');

    const oldMemory = memoryRow(store, oldId);
    assert.equal(oldMemory.status, 'superseded');

    const newMemory = memoryRow(store, newId);
    assert.equal(newMemory.content, 'hello universe');
    assert.equal(newMemory.status, 'active');

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
    const oldId = store.store('hello world', { kind: 'note' });
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
    const oldId = store.store('hello world', { kind: 'note' });
    const newId = store.supersede(oldId, 'hello universe', {
      metadata: { tag: 'greeting' },
    });

    assert.deepEqual(JSON.parse(memoryRow(store, newId).metadata!), { tag: 'greeting' });
  } finally {
    cleanup();
  }
});

test('supersede: the head inherits the source kind column and unions legacy tags', () => {
  const { store, cleanup } = tempStore();
  try {
    // The tags convention is legacy truth, not authored vocabulary: the
    // array lives in a migrated row's metadata (raw probe), and the
    // structural inheritance copies it — while an authored array would be
    // refused at the gate (#51: arrays cannot be asked for by the filter).
    const oldId = store.store('hello world', { kind: 'note', metadata: { session: 2 } });
    const raw = probe(store);
    raw
      .prepare('UPDATE memories SET metadata = ? WHERE id = ?')
      .run(JSON.stringify({ tags: ['a', 'b'], session: 2 }), oldId);
    raw.close();
    const newId = store.supersede(oldId, 'hello universe');

    // The kind column carries (omitted kind = inherited, #31); tags are
    // structural and carry through the inheritance (copying is not
    // authoring); contextual keys do not.
    assert.equal(memoryRow(store, newId).kind, 'note');
    assert.deepEqual(JSON.parse(memoryRow(store, newId).metadata!), {
      tags: ['a', 'b'],
    });
  } finally {
    cleanup();
  }
});

test('supersede: explicit metadata is used verbatim, no inherit — the kind still is', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world', {
      kind: 'note',
      metadata: { tag: 'a' },
    });
    const newId = store.supersede(oldId, 'hello universe', {
      metadata: { session: 3 },
    });

    // Explicit metadata wins verbatim (no tag inheritance), while the kind
    // column inherits: the kind is not metadata's business anymore.
    assert.deepEqual(JSON.parse(memoryRow(store, newId).metadata!), { session: 3 });
    assert.equal(memoryRow(store, newId).kind, 'note');
  } finally {
    cleanup();
  }
});

test('supersede: metadata.kind is refused — the kind rides the column', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world', { kind: 'note' });
    assert.throws(
      () => store.supersede(oldId, 'hello universe', { metadata: { kind: 'decision' } }),
      /kind is a column — pass kind, not metadata\.kind/,
    );
  } finally {
    cleanup();
  }
});

test('supersede: a provided kind reclassifies the revision', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('a fleeting note', { kind: 'note' });
    const newId = store.supersede(oldId, 'the decision it became', { kind: 'decision' });

    assert.equal(memoryRow(store, newId).kind, 'decision', 'the revision reclassifies');
    assert.equal(memoryRow(store, oldId).kind, 'note', 'history is untouched');
  } finally {
    cleanup();
  }
});

test('supersede: an explicitly empty kind is refused', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world', { kind: 'note' });
    assert.throws(
      () => store.supersede(oldId, 'hello universe', { kind: '' }),
      /kind must be non-empty/,
    );
    // The refusal is pre-transactional: no successor landed, the source
    // stays active and unbridged.
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 1);
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('supersede: no metadata in, no metadata out — the kind column still inherits', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('hello world', { kind: 'note' });
    const newId = store.supersede(oldId, 'hello universe');

    assert.equal(memoryRow(store, newId).metadata, null);
    assert.equal(memoryRow(store, newId).kind, 'note');
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
    const oldId = store.store('old content', { kind: 'note' });
    assert.throws(() => store.supersede(oldId, ''), /content must be non-empty/);
  } finally {
    cleanup();
  }
});

test('supersede: throws when old memory is not active', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('old content', { kind: 'note' });
    store.deprecate(oldId);
    assert.throws(
      () => store.supersede(oldId, 'new content'),
      /cannot supersede a memory with status 'deprecated'/,
    );
  } finally {
    cleanup();
  }
});

test('supersede: a hot source transfers its status to the head, the source dies superseded', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('a curated memory', { kind: 'note' });
    store.setHot(oldId, true);
    const newId = store.supersede(oldId, 'the revision');

    assert.equal(memoryRow(store, newId).status, 'hot', 'the head takes the curation over');
    assert.equal(
      memoryRow(store, oldId).status,
      'superseded',
      'the source dies with its status — one column, no cooling mark to clear',
    );
  } finally {
    cleanup();
  }
});

test('supersede: a cold source yields a cold head', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('a plain memory', { kind: 'note' });
    const newId = store.supersede(oldId, 'the revision');
    assert.equal(memoryRow(store, newId).status, 'active');
  } finally {
    cleanup();
  }
});

test('supersede: relations attach to the NEW memory, supersedes edge still lands', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('# Decision: v1', { kind: 'decision' });
    const other = store.store('a live target', { kind: 'note' });
    const newId = store.supersede(oldId, '# Decision: v2', {
      relations: [{ to: other, kind: 'references' }],
    });
    const out = edgesOf(store, newId);
    assert.deepEqual(
      out.map((edge) => `${edge.kind}->${edge.to_id}`),
      [`references->${other}`],
    );
    // The old memory keeps exactly its supersedes bridge — the bridge
    // leaves the OLD memory; the head carries only its authored claims.
    const bridge = edgesOf(store, oldId);
    assert.deepEqual(
      bridge.map((edge) => `${edge.kind}->${edge.to_id}`),
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
    const oldId = store.store('# Decision: v1', { kind: 'decision' });
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
    const targetA = store.store('target A', { kind: 'note' });
    const targetB = store.store('target B', { kind: 'note' });
    const oldId = store.store('# Decision: v1', {
      kind: 'decision',
      relations: [
        { to: targetA, kind: 'references' },
        { to: targetB, kind: 'extends' },
      ],
    });
    const newId = store.supersede(oldId, '# Decision: v2 (content)');
    const inherited = edgesOf(store, newId).filter((edge) => edge.kind !== 'supersedes');
    // The two authored claims carried over, ROW VERBATIM (kind, metadata,
    // created_at) — the head claims what v1 claimed.
    assert.deepEqual(inherited.map((edge) => [edge.kind, edge.to_id]).sort(), [
      ['extends', targetB],
      ['references', targetA],
    ]);
    const sourceRows = edgesOf(store, oldId).filter((edge) => edge.kind !== 'supersedes');
    for (const copy of inherited) {
      const source = sourceRows.find(
        (sourceRow) => sourceRow.kind === copy.kind && sourceRow.to_id === copy.to_id,
      );
      assert.ok(source, 'each copied edge has a source row');
      assert.equal(
        copy.created_at,
        source!.created_at,
        'verbatim copy carries the original timestamp',
      );
      assert.equal(copy.metadata, source!.metadata);
    }
    // Addition-only: the old memory KEEPS its edges (provenance), plus the
    // new supersedes bridge. The head is not isolated — the edge set is
    // intact (the doctor's status_without_bridge check verifies this).
    assert.equal(edgesOf(store, oldId).length, 3);
    assert.equal(edgesOf(store, newId).length, 2);
  } finally {
    cleanup();
  }
});

test('supersede: explicit relations REPLACE the inherited set verbatim', () => {
  const { store, cleanup } = tempStore();
  try {
    const targetA = store.store('target A', { kind: 'note' });
    const targetC = store.store('target C', { kind: 'note' });
    const oldId = store.store('# Decision: v1', {
      kind: 'decision',
      relations: [{ to: targetA, kind: 'references' }],
    });
    const newId = store.supersede(oldId, '# Decision: v2 — claims corrected', {
      relations: [{ to: targetC, kind: 'references' }],
    });
    const out = edgesOf(store, newId).filter((edge) => edge.kind !== 'supersedes');
    // Verbatim wins over inheritance, the way explicit metadata
    // overrides kind/tags inheritance.
    assert.deepEqual(
      out.map((edge) => `${edge.kind}->${edge.to_id}`),
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
    const oldId = store.store('# Decision: v1', { kind: 'decision' });
    const ghost = '00000000-0000-4000-8000-000000000003';
    // Corruption via a second raw connection — the outside-the-library
    // vantage: FKs off, the orphan lands, the connection goes away.
    const raw = probe(store);
    raw.exec('PRAGMA foreign_keys = OFF');
    raw
      .prepare(
        'INSERT INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(oldId, ghost, 'references', null, new Date().toISOString());
    raw.close();
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
    const id = store.store('to be deprecated', { kind: 'note' });
    store.setHot(id, true);
    store.deprecate(id);

    const m = memoryRow(store, id);
    assert.equal(
      m.status,
      'deprecated',
      'the status just moves — cooling is free, no parallel mark to clear (#38)',
    );
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
    const id = store.store('content', { kind: 'note' });
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
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    const mergedId = store.merge([a, b], 'combined content');

    assert.ok(uuidRegex(mergedId), 'merged id should be a UUID');

    const merged = memoryRow(store, mergedId);
    assert.equal(merged.content, 'combined content');
    assert.equal(merged.status, 'active');

    assert.equal(memoryRow(store, a).status, 'merged');
    assert.equal(memoryRow(store, b).status, 'merged');

    const bridges = edgesOf(store, a).concat(edgesOf(store, b));
    assert.deepEqual(bridges.map((edge) => `${edge.kind}->${edge.to_id}`).sort(), [
      `merges->${mergedId}`,
      `merges->${mergedId}`,
    ]);
  } finally {
    cleanup();
  }
});

test('merge: stores authored metadata on the merged memory', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    const mergedId = store.merge([a, b], 'combined', {
      metadata: { mark: 'merged' },
    });

    assert.deepEqual(JSON.parse(memoryRow(store, mergedId).metadata!), { mark: 'merged' });
  } finally {
    cleanup();
  }
});

test('merge: inherits the kind when every source agrees, unions legacy tags', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('alpha', { kind: 'note', metadata: { tag: 'x' } });
    const b = store.store('beta', { kind: 'note' });
    // The second source's tags ride as legacy truth: the array was
    // authored by a pre-refonte agent, the raw probe carries it (#51:
    // arrays are unauthored vocabulary — the structural inheritance
    // copies what exists).
    const raw = probe(store);
    raw
      .prepare('UPDATE memories SET metadata = ? WHERE id = ?')
      .run(JSON.stringify({ tags: ['y', 'x'] }), b);
    raw.close();
    const id = store.merge([a, b], 'alpha beta combined');

    // The kind column inherits on agreement; the tags union in metadata —
    // in first-seen order: a carries no tags array, b's own order stands.
    assert.equal(memoryRow(store, id).kind, 'note');
    assert.deepEqual(JSON.parse(memoryRow(store, id).metadata!), {
      tags: ['y', 'x'],
    });
  } finally {
    cleanup();
  }
});

test('merge: sources disagreeing on kind are refused with the candidate kinds', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('alpha', { kind: 'note', metadata: { tag: 'x' } });
    const b = store.store('beta', { kind: 'decision' });
    assert.throws(
      () => store.merge([a, b], 'alpha beta combined'),
      /merge refused: sources disagree on kind \(decision, note\) — pass kind to classify the fusion/,
    );
    // Refuse, don't hide: nothing landed, the sources stay active.
    assert.equal(memoryRow(store, a).status, 'active');
    assert.equal(memoryRow(store, b).status, 'active');
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('merge: a provided kind wins — the fusion is classified, not inherited', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('alpha', { kind: 'note' });
    const b = store.store('beta', { kind: 'decision' });
    const id = store.merge([a, b], 'alpha beta combined', { kind: 'summary' });

    assert.equal(memoryRow(store, id).kind, 'summary', 'the provided kind wins');
  } finally {
    cleanup();
  }
});

test('merge: an explicitly empty kind is refused', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    assert.throws(() => store.merge([a, b], 'the fusion', { kind: '' }), /kind must be non-empty/);
    // Refuse, don't hide: the sources stay active, nothing landed.
    assert.equal(memoryRow(store, a).status, 'active');
    assert.equal(memoryRow(store, b).status, 'active');
    assert.equal(count(store, 'SELECT count(*) as c FROM edges'), 0);
  } finally {
    cleanup();
  }
});

test('merge: metadata.kind is refused — the kind rides the column', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    assert.throws(
      () => store.merge([a, b], 'combined', { metadata: { kind: 'note' } }),
      /kind is a column — pass kind, not metadata\.kind/,
    );
  } finally {
    cleanup();
  }
});

test('merge: the hot status unions across sources, sources die merged', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('hot memory a', { kind: 'note' });
    const b = store.store('cold memory b', { kind: 'note' });
    store.setHot(a, true);
    const mergedId = store.merge([a, b], 'the fusion');

    assert.equal(memoryRow(store, mergedId).status, 'hot', 'one hot source makes the fusion hot');
    assert.equal(memoryRow(store, a).status, 'merged', 'the source dies with its status');
    assert.equal(memoryRow(store, b).status, 'merged');
  } finally {
    cleanup();
  }
});

test('merge: all-cold sources yield a cold fusion', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    const mergedId = store.merge([a, b], 'the fusion');
    assert.equal(memoryRow(store, mergedId).status, 'active');
  } finally {
    cleanup();
  }
});

test('merge: throws on fewer than 2 ids', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('only one', { kind: 'note' });
    assert.throws(() => store.merge([a], 'content'), /merge requires at least 2 memories/);
  } finally {
    cleanup();
  }
});

test('merge: throws on duplicate ids', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    assert.throws(() => store.merge([a, a], 'content'), /duplicate id in merge/);
  } finally {
    cleanup();
  }
});

test('merge: throws on unknown id', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    assert.throws(() => store.merge([a, 'nope'], 'content'), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test('merge: throws on empty content', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    assert.throws(() => store.merge([a, b], ''), /content must be non-empty/);
  } finally {
    cleanup();
  }
});

test('merge: throws when an original is not active', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
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

test('setHot: the only reversible edge — active to hot, and back', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('a curated memory', { kind: 'note' });
    store.setHot(id, true);
    assert.equal(memoryRow(store, id).status, 'hot');
    store.setHot(id, false);
    assert.equal(memoryRow(store, id).status, 'active');
    // The edge is a transition, not a toggle with memory: reheating an
    // already-hot memory is a no-op, not an error.
    store.setHot(id, true);
    store.setHot(id, true);
    assert.equal(memoryRow(store, id).status, 'hot');
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

test('setHot: only the living can transition — a terminal refuses both directions', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('content', { kind: 'note' });
    store.deprecate(id);
    assert.throws(() => store.setHot(id, true), /cannot setHot a memory with status 'deprecated'/);
    assert.throws(() => store.setHot(id, false), /cannot setHot a memory with status 'deprecated'/);

    const oldId = store.store('a decision', { kind: 'note' });
    const newId = store.supersede(oldId, 'the revision');
    assert.throws(
      () => store.setHot(oldId, true),
      /cannot setHot a memory with status 'superseded'/,
    );
    // The head itself is living — it heats, and cools back.
    store.setHot(newId, true);
    assert.equal(memoryRow(store, newId).status, 'hot');
    store.setHot(newId, false);
    assert.equal(memoryRow(store, newId).status, 'active');
  } finally {
    cleanup();
  }
});

// --- summary ---------------------------------------------------------------

test('store: a content beyond the ceiling refuses without a summary', () => {
  const { store, cleanup } = tempStore();
  try {
    const longContent = 'a'.repeat(401);
    assert.throws(
      () => store.store(longContent, { kind: 'note' }),
      /content exceeds 400 characters; provide a summary condensing it/,
    );
    assert.equal(count(store, 'SELECT count(*) as c FROM memories'), 0);
  } finally {
    cleanup();
  }
});

test('store: a content at the ceiling needs no summary', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('a'.repeat(400), { kind: 'note' });
    assert.equal(memoryRow(store, id).summary, null);
  } finally {
    cleanup();
  }
});

test('store: a long content lands with its authored summary', () => {
  const { store, cleanup } = tempStore();
  try {
    const summary = 'the essence of the long memory';
    const id = store.store('a'.repeat(401), { kind: 'note', summary });
    const memory = memoryRow(store, id);
    assert.equal(memory.summary, summary);
  } finally {
    cleanup();
  }
});

test('store: a summary beyond the ceiling refuses — a condensation, not a second copy', () => {
  const { store, cleanup } = tempStore();
  try {
    const bloated = 'a'.repeat(401);
    assert.throws(
      () => store.store('the content', { kind: 'note', summary: bloated }),
      /summary exceeds 400 characters; condense it further/,
    );
  } finally {
    cleanup();
  }
});

test('store: a summary at the ceiling lands', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('a'.repeat(401), { kind: 'note', summary: 'a'.repeat(400) });
    assert.equal(memoryRow(store, id).summary, 'a'.repeat(400));
  } finally {
    cleanup();
  }
});

test('supersede: the summary is authored fresh for the new content, never carried over', () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store('a'.repeat(401), { kind: 'note', summary: 'the old essence' });

    // A long revision owes its own summary — the old one condenses the old
    // content, not this one.
    assert.throws(() => store.supersede(oldId, 'a'.repeat(401)), /content exceeds 400 characters/);

    const newId = store.supersede(oldId, 'a'.repeat(401), { summary: 'the new essence' });
    const newMemory = memoryRow(store, newId);
    assert.equal(newMemory.summary, 'the new essence', 'the fresh summary serves');
    assert.equal(memoryRow(store, oldId).summary, 'the old essence', 'history is untouched');

    // A short revision needs no summary and lands cold-condensed: null.
    const shortId = store.supersede(newId, 'short and complete');
    assert.equal(memoryRow(store, shortId).summary, null);
  } finally {
    cleanup();
  }
});

test('merge: the fusion owes its summary as any other write', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });

    assert.throws(() => store.merge([a, b], 'a'.repeat(401)), /content exceeds 400 characters/);

    const mergedId = store.merge([a, b], 'a'.repeat(401), {
      summary: 'the fusion essence',
    });
    assert.equal(memoryRow(store, mergedId).summary, 'the fusion essence');
  } finally {
    cleanup();
  }
});
