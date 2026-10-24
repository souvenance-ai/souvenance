import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// --- get --------------------------------------------------------------------

test('get: returns a memory by id — content, parsed metadata, hot as boolean', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('hello world', { metadata: { tags: ['a'] } });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.id, id);
    assert.equal(m!.content, 'hello world');
    assert.deepEqual(m!.metadata, { tags: ['a'] });
    assert.ok(typeof m!.created_at === 'string');
    assert.equal(m!.hot, false);
    assert.equal(m!.summary, null);
    assert.equal(m!.status, 'active');
  } finally {
    cleanup();
  }
});

test('get: returns the authored summary and null metadata as null', () => {
  const { store, cleanup } = tempStore();
  try {
    const long = 'x'.repeat(401);
    const id = store.store(long, { summary: 'condensed' });
    const m = store.get(id);
    assert.equal(m!.summary, 'condensed');

    const bare = store.store('no metadata');
    assert.equal(store.get(bare)!.metadata, null);
  } finally {
    cleanup();
  }
});

test('get: returns null for unknown id', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.equal(store.get('nonexistent-id'), null);
  } finally {
    cleanup();
  }
});

test('get: projects the graph — relations { out, in }, raw rows at depth 1', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { metadata: { kind: 'note' } });
    const b = store.store('memory b', { metadata: { kind: 'note' } });
    const c = store.store('memory c', { metadata: { kind: 'note' } });
    store.link(a, b, 'references'); // b: an incoming edge
    store.link(b, c, 'extends'); // b: an outgoing edge

    const m = store.get(b)!;
    assert.equal(m.relations.out.length, 1);
    assert.equal(m.relations.out[0]!.kind, 'extends');
    assert.equal(m.relations.out[0]!.to_id, c);
    assert.equal(m.relations.out[0]!.target, null, 'raw rows by default');
    assert.equal(m.relations.in.length, 1);
    assert.equal(m.relations.in[0]!.kind, 'references');
    assert.equal(m.relations.in[0]!.from_id, a);
    assert.equal('target' in m.relations.in[0]!, false, 'in edges never expand');
  } finally {
    cleanup();
  }
});

test('get: an unlinked memory carries empty relations arrays', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('an island', { metadata: { kind: 'note' } });
    const m = store.get(id)!;
    assert.deepEqual(m.relations, { out: [], in: [] });
  } finally {
    cleanup();
  }
});

test('get: restores corrupted metadata JSON as null metadata', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('hand-corrupted metadata');
    store.db.prepare('UPDATE memories SET metadata = ? WHERE id = ?').run('{not json', id);
    const m = store.get(id);
    assert.equal(m!.metadata, null);
  } finally {
    cleanup();
  }
});

/** The store's created_at has millisecond precision — back-to-back store()
 * calls can land in the same ms and make created_at DESC ties undefined
 * (caught live on a fast CI runner by the legacy port). Seeding spins to
 * the next millisecond between writes whose order the tests pin. */
function advanceMs(): void {
  const t0 = Date.now();
  while (Date.now() === t0) {}
}

function seed(store: Store): { a: string; b: string; c: string } {
  const a = store.store('The quick brown fox jumps', {
    metadata: { tags: ['animal'], kind: 'note' },
  });
  advanceMs();
  const b = store.store('Hello world from the fox', {
    metadata: { tags: ['greeting'], kind: 'log' },
  });
  advanceMs();
  const c = store.store('A lazy dog sleeps', { metadata: { tags: ['animal'], kind: 'note' } });
  store.link(a, b, 'references');
  store.link(b, c, 'extends');
  return { a, b, c };
}

// --- list -------------------------------------------------------------------

test('list: returns memories ordered by created_at DESC', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, c } = seed(store);
    const results = store.list();
    assert.equal(results.length, 3);
    assert.equal(results[0]!.id, c, 'most recent should be first');
    assert.equal(results[2]!.id, a, 'oldest should be last');
  } finally {
    cleanup();
  }
});

test('list: respects limit and offset', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b, c } = seed(store);
    const page1 = store.list({ limit: 2, offset: 0 });
    assert.equal(page1.length, 2);
    assert.equal(page1[0]!.id, c);
    assert.equal(page1[1]!.id, b);

    const page2 = store.list({ limit: 2, offset: 2 });
    assert.equal(page2.length, 1);
    assert.equal(page2[0]!.id, a);
  } finally {
    cleanup();
  }
});

test('list: default limit is 20', () => {
  const { store, cleanup } = tempStore();
  try {
    for (let i = 0; i < 25; i++) {
      store.store(`memory ${i}`);
    }
    assert.equal(store.list().length, 20);
  } finally {
    cleanup();
  }
});

test('list: applies the where filter on metadata', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.list({ where: `metadata->>'$.kind' = 'note'` });
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.metadata?.['kind'], 'note');
    }
  } finally {
    cleanup();
  }
});

test('list: defaults to active memories only — includeLegacy widens', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    store.store('memory b');
    store.deprecate(a);
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0]!.status, 'active');

    const all = store.list({ includeLegacy: true });
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((m) => m.status).sort(), ['active', 'deprecated']);
  } finally {
    cleanup();
  }
});

test('list: projects relations at depth 1 — nodes, not bare rows', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.list();
    assert.equal(results.length, 3);
    const edges = results.flatMap((m) => m.relations.out);
    assert.equal(edges.length, 2);
    assert.equal(edges[0]!.target, null, 'depth 1 stays raw');
  } finally {
    cleanup();
  }
});

test('list: returns empty array when no memories', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.deepEqual(store.list(), []);
  } finally {
    cleanup();
  }
});

test('list: limit must be an integer >= 1, offset an integer >= 0', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.list({ limit: 0 }), /limit must be an integer >= 1/);
    assert.throws(() => store.list({ limit: 1.5 }), /limit must be an integer >= 1/);
    assert.throws(() => store.list({ offset: -1 }), /offset must be an integer >= 0/);
    assert.throws(() => store.list({ offset: 0.5 }), /offset must be an integer >= 0/);
  } finally {
    cleanup();
  }
});

// --- search -----------------------------------------------------------------

test('search: returns ranked FTS5 results', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search('fox');
    assert.ok(results.length >= 2);
    for (const r of results) {
      assert.ok('id' in r);
      assert.ok('content' in r);
      assert.ok('summary' in r);
      assert.ok('metadata' in r);
      assert.ok('created_at' in r);
      assert.ok('status' in r);
      assert.ok('rank' in r);
      assert.ok(typeof r.rank === 'number');
      assert.ok('relations' in r, 'hits are projected nodes');
    }
  } finally {
    cleanup();
  }
});

test('search: bm25 ranking puts the best match first', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search('fox');
    assert.ok(results.length >= 2);
    const first = results[0]!;
    assert.ok(
      first.content.toLowerCase().includes('fox'),
      'top result should contain the query term',
    );
  } finally {
    cleanup();
  }
});

test('search: respects limit', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    assert.equal(store.search('fox', { limit: 1 }).length, 1);
  } finally {
    cleanup();
  }
});

test('search: default limit is 20', () => {
  const { store, cleanup } = tempStore();
  try {
    for (let i = 0; i < 25; i++) {
      store.store(`memory number ${i} with fox`);
    }
    assert.equal(store.search('fox').length, 20);
  } finally {
    cleanup();
  }
});

test('search: applies the where filter on metadata', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search('fox', { where: `metadata->>'$.kind' = 'note'` });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.metadata?.['kind'], 'note');
  } finally {
    cleanup();
  }
});

test('search: throws on empty query', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.search(''), /query must be non-empty/);
  } finally {
    cleanup();
  }
});

test('search: deserializes metadata JSON — null stays null', () => {
  const { store, cleanup } = tempStore();
  try {
    store.store('searchable text', { metadata: { tags: ['x'] } });
    store.store('more searchable text');
    const results = store.search('searchable');
    assert.equal(results.length, 2);
    const tagged = results.find((r) => r.metadata !== null)!;
    assert.deepEqual(tagged.metadata, { tags: ['x'] });
    const bare = results.find((r) => r.metadata === null)!;
    assert.equal(bare.metadata, null);
  } finally {
    cleanup();
  }
});

test('search: defaults to active memories only — includeLegacy widens', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('searchable fox content');
    store.supersede(a, 'searchable fox replacement');
    const results = store.search('fox');
    assert.equal(results.length, 1);
    assert.equal(results[0]!.status, 'active');

    const all = store.search('fox', { includeLegacy: true });
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((r) => r.status).sort(), ['active', 'superseded']);
  } finally {
    cleanup();
  }
});

test('search: sanitizes FTS5 syntax errors as a fallback', () => {
  const { store, cleanup } = tempStore();
  try {
    store.store('weight meaning: importance scale 0.9 vs 0.5, a 0.9 weight is a constraint');
    store.store('token glue: better-sqlite3 and node:sqlite identifiers');

    // dotted numerics — failed with 'fts5: syntax error near "."' before the fix
    const dotted = store.search('0.9 vs 0.5');
    assert.ok(dotted.length >= 1, 'dotted numerics should be sanitized into searchable tokens');
    assert.ok(
      dotted.some((r) => r.content.includes('0.9 vs 0.5')),
      'should hit the weight memory',
    );

    // hyphenated identifier — also failed before the fix
    const hyphen = store.search('better-sqlite3');
    assert.ok(hyphen.length >= 1, 'hyphenated tokens should be split and matched');
    assert.ok(
      hyphen.some((r) => r.content.includes('better-sqlite3')),
      'should hit the glue memory',
    );

    // valid queries keep working untouched (fallback must never run on them)
    store.store('apple fruit');
    store.store('banana fruit');
    const either = store.search('apple OR banana');
    assert.equal(either.length, 2, 'OR operator preserved');
    const phrase = store.search('"apple fruit"');
    assert.equal(phrase.length, 1, 'quoted phrase preserved');

    // nothing sanitizable -> the original error still surfaces
    assert.throws(() => store.search('((('), /fts5: syntax error/);
  } finally {
    cleanup();
  }
});

// --- stats ------------------------------------------------------------------

test('stats: totals and edges_by_kind breakdown', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const s = store.stats();
    assert.equal(s.memories, 3);
    assert.equal(s.edges, 2);
    assert.equal(s.edges_by_kind['references'], 1);
    assert.equal(s.edges_by_kind['extends'], 1);
  } finally {
    cleanup();
  }
});

test('stats: zeros on a fresh store', () => {
  const { store, cleanup } = tempStore();
  try {
    const s = store.stats();
    assert.equal(s.memories, 0);
    assert.equal(s.hot_memories, 0);
    assert.equal(s.edges, 0);
    assert.deepEqual(s.memories_by_status, {});
    assert.deepEqual(s.memories_by_kind, {});
    assert.deepEqual(s.edges_by_kind, {});
  } finally {
    cleanup();
  }
});

test('stats: memories_by_status, hot_memories and memories_by_kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { metadata: { kind: 'note' } });
    const b = store.store('memory b', { metadata: { kind: 'log' } });
    const c = store.store('memory c', { metadata: { kind: 'note' } });
    store.store('a kind-less memory'); // counts, but never appears in the kind ledger
    store.deprecate(a);
    store.supersede(b, 'memory b replacement');
    store.setHot(c, true);

    const s = store.stats();
    assert.equal(s.memories, 5);
    assert.equal(s.hot_memories, 1);
    assert.deepEqual(s.memories_by_status, {
      active: 3,
      deprecated: 1,
      superseded: 1,
    });
    assert.deepEqual(s.memories_by_kind, { log: 2, note: 2 });
  } finally {
    cleanup();
  }
});

test('stats: reads stay reads — no read ever moves the counts', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = seed(store);
    const before = store.stats();
    store.list();
    store.get(a);
    store.search('fox');
    const after = store.stats();
    assert.deepEqual(after, before);
  } finally {
    cleanup();
  }
});

// --- read-only serving ------------------------------------------------------

/**
 * The read-only source is a store written read-write and closed cleanly —
 * the realistic consumer scenario, since a ro connection cannot recover a
 * WAL it cannot write. (The ro open refusals — missing file, older schema,
 * zero-page file — and the write-verb refusals live in store.open.test.ts.)
 */
function seededStorePath(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-ro-'));
  const path = join(dir, 'memory.db');
  const store = Store.open({ dbPath: path });
  const a = store.store('alpha decision', {
    metadata: { kind: 'decision' },
    summary: 'alpha condensed',
  });
  const b = store.store('beta note', { metadata: { kind: 'note' } });
  store.link(a, b, 'references');
  store.setHot(a, true);
  store.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('read-only: every read verb serves the store as its owner left it', () => {
  const { path, cleanup } = seededStorePath();
  try {
    const store = Store.open({ dbPath: path, readOnly: true });
    try {
      assert.equal(store.readOnly, true);

      assert.equal(store.list().length, 2);

      const found = store.search('alpha');
      assert.equal(found.length, 1);

      const got = store.get(found[0]!.id);
      assert.ok(got);
      assert.equal(got!.summary, 'alpha condensed');
      assert.equal(got!.relations.out[0]!.kind, 'references');
      const beta = store.list().find((m) => m.content === 'beta note')!.id;
      assert.equal(got!.relations.out[0]!.to_id, beta, 'the raw edge is served, target-less');
      assert.equal(got!.relations.out[0]!.target, null);

      const report = store.recover();
      assert.equal(report.hot.length, 1);
      assert.equal(report.hot[0]!.id, found[0]!.id, 'the hot block serves through ro too');

      assert.equal(store.stats().hot_memories, 1);
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});
