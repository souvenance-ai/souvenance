import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'vitest';
import { Store } from './store.ts';

/**
 * A raw probe connection — the hand-SQL vantage. The store's own
 * connection is `#db`-private by design: corruption enters the file the
 * way it would in reality, from outside the library, on a second raw
 * connection.
 */
function probe(store: Store): DatabaseSync {
  const db = new DatabaseSync(store.dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

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

test('get: returns a memory by id — content, kind, parsed metadata, status', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('hello world', { kind: 'note', metadata: { tags: ['a'] } });
    const memory = store.get(id);
    assert.ok(memory);
    assert.equal(memory!.id, id);
    assert.equal(memory!.content, 'hello world');
    assert.equal(memory!.kind, 'note', 'kind is a first-class column of the served memory');
    assert.deepEqual(memory!.metadata, { tags: ['a'] });
    assert.ok(typeof memory!.created_at === 'string');
    assert.equal(memory!.summary, null);
    assert.equal(
      memory!.status,
      'active',
      'born active — hot is a status, earned via setHot (#38)',
    );
  } finally {
    cleanup();
  }
});

test('get: returns the authored summary and null metadata as null', () => {
  const { store, cleanup } = tempStore();
  try {
    const long = 'x'.repeat(401);
    const id = store.store(long, { kind: 'note', summary: 'condensed' });
    const memory = store.get(id);
    assert.equal(memory!.summary, 'condensed');

    const bare = store.store('no metadata', { kind: 'note' });
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
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    const c = store.store('memory c', { kind: 'note' });
    store.link(a, b, 'references'); // b: an incoming edge
    store.link(b, c, 'extends'); // b: an outgoing edge

    const memory = store.get(b)!;
    assert.equal(memory.relations.out.length, 1);
    assert.equal(memory.relations.out[0]!.kind, 'extends');
    assert.equal(memory.relations.out[0]!.to_id, c);
    assert.equal(memory.relations.out[0]!.target, null, 'raw rows by default');
    assert.equal(memory.relations.in.length, 1);
    assert.equal(memory.relations.in[0]!.kind, 'references');
    assert.equal(memory.relations.in[0]!.from_id, a);
    assert.equal('target' in memory.relations.in[0]!, false, 'in edges never expand');
  } finally {
    cleanup();
  }
});

test('get: an unlinked memory carries empty relations arrays', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('an island', { kind: 'note' });
    const memory = store.get(id)!;
    assert.deepEqual(memory.relations, { out: [], in: [] });
  } finally {
    cleanup();
  }
});

test('get: restores corrupted metadata JSON as null metadata', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('hand-corrupted metadata', { kind: 'note' });
    // Corruption via the raw probe — the outside-the-library vantage.
    const raw = probe(store);
    raw.prepare('UPDATE memories SET metadata = ? WHERE id = ?').run('{not json', id);
    raw.close();
    const memory = store.get(id);
    assert.equal(memory!.metadata, null);
  } finally {
    cleanup();
  }
});

/** The store'report created_at has millisecond precision — back-to-back store()
 * calls can land in the same ms and make created_at DESC ties undefined
 * (caught live on a fast CI runner by the legacy port). Seeding spins to
 * the next millisecond between writes whose order the tests pin. */
function advanceMs(): void {
  const t0 = Date.now();
  while (Date.now() === t0) {}
}

function seed(store: Store): { a: string; b: string; c: string } {
  const a = store.store('The quick brown fox jumps', {
    kind: 'note',
    metadata: { tags: ['animal'] },
  });
  advanceMs();
  const b = store.store('Hello world from the fox', {
    kind: 'log',
    metadata: { tags: ['greeting'] },
  });
  advanceMs();
  const c = store.store('A lazy dog sleeps', { kind: 'note', metadata: { tags: ['animal'] } });
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
      store.store(`memory ${i}`, { kind: 'note' });
    }
    assert.equal(store.list().length, 20);
  } finally {
    cleanup();
  }
});

test('list: applies the where filter on the row — the kind column since v6', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.list({ where: `kind = 'note'` });
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.kind, 'note');
    }
  } finally {
    cleanup();
  }
});

test('list: defaults to active memories only — includeLegacy widens', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    store.store('memory b', { kind: 'note' });
    store.deprecate(a);
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0]!.status, 'active');

    const all = store.list({ includeLegacy: true });
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((memory) => memory.status).sort(), ['active', 'deprecated']);
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
    const edges = results.flatMap((memory) => memory.relations.out);
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
    for (const result of results) {
      assert.ok('id' in result);
      assert.ok('content' in result);
      assert.ok('kind' in result, 'the kind column rides every served node');
      assert.ok('summary' in result);
      assert.ok('metadata' in result);
      assert.ok('created_at' in result);
      assert.ok('status' in result);
      assert.ok('rank' in result);
      assert.ok(typeof result.rank === 'number');
      assert.ok('relations' in result, 'hits are projected nodes');
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
      store.store(`memory number ${i} with fox`, { kind: 'note' });
    }
    assert.equal(store.search('fox').length, 20);
  } finally {
    cleanup();
  }
});

test('search: applies the where filter on the row — the kind column since v6', () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search('fox', { where: `kind = 'note'` });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.kind, 'note');
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
    store.store('searchable text', { kind: 'note', metadata: { tags: ['x'] } });
    store.store('more searchable text', { kind: 'note' });
    const results = store.search('searchable');
    assert.equal(results.length, 2);
    const tagged = results.find((result) => result.metadata !== null)!;
    assert.deepEqual(tagged.metadata, { tags: ['x'] });
    const bare = results.find((result) => result.metadata === null)!;
    assert.equal(bare.metadata, null);
  } finally {
    cleanup();
  }
});

test('search: defaults to active memories only — includeLegacy widens', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('searchable fox content', { kind: 'note' });
    store.supersede(a, 'searchable fox replacement');
    const results = store.search('fox');
    assert.equal(results.length, 1);
    assert.equal(results[0]!.status, 'active');

    const all = store.search('fox', { includeLegacy: true });
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((result) => result.status).sort(), ['active', 'superseded']);
  } finally {
    cleanup();
  }
});

test('search: sanitizes FTS5 syntax errors as a fallback', () => {
  const { store, cleanup } = tempStore();
  try {
    store.store('weight meaning: importance scale 0.9 vs 0.5, a 0.9 weight is a constraint', {
      kind: 'note',
    });
    store.store('token glue: better-sqlite3 and node:sqlite identifiers', { kind: 'note' });

    // dotted numerics — failed with 'fts5: syntax error near "."' before the fix
    const dotted = store.search('0.9 vs 0.5');
    assert.ok(dotted.length >= 1, 'dotted numerics should be sanitized into searchable tokens');
    assert.ok(
      dotted.some((result) => result.content.includes('0.9 vs 0.5')),
      'should hit the weight memory',
    );

    // hyphenated identifier — also failed before the fix
    const hyphen = store.search('better-sqlite3');
    assert.ok(hyphen.length >= 1, 'hyphenated tokens should be split and matched');
    assert.ok(
      hyphen.some((result) => result.content.includes('better-sqlite3')),
      'should hit the glue memory',
    );

    // valid queries keep working untouched (fallback must never run on them)
    store.store('apple fruit', { kind: 'note' });
    store.store('banana fruit', { kind: 'note' });
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
    const report = store.stats();
    assert.equal(report.memories, 3);
    assert.equal(report.edges, 2);
    assert.equal(report.edges_by_kind['references'], 1);
    assert.equal(report.edges_by_kind['extends'], 1);
  } finally {
    cleanup();
  }
});

test('stats: zeros on a fresh store', () => {
  const { store, cleanup } = tempStore();
  try {
    const report = store.stats();
    assert.equal(report.memories, 0);
    assert.equal(report.edges, 0);
    assert.deepEqual(report.memories_by_status, {});
    assert.deepEqual(report.memories_by_kind, {});
    assert.deepEqual(report.edges_by_kind, {});
  } finally {
    cleanup();
  }
});

test('stats: memories_by_status (hot serves through it) and memories_by_kind', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'log' });
    const c = store.store('memory c', { kind: 'note' });
    const d = store.store('memory d', { kind: 'note' });
    store.store('an unclassified memory', { kind: 'unclassified' }); // the migration's marked debt
    store.deprecate(a);
    store.supersede(b, 'memory b replacement');
    store.setHot(c, true);
    assert.ok(d);

    const report = store.stats();
    assert.equal(report.memories, 6, 'the supersede head adds a row');
    assert.deepEqual(report.memories_by_status, {
      active: 3,
      deprecated: 1,
      hot: 1,
      superseded: 1,
    });
    assert.equal(
      report.memories_by_status['hot'],
      1,
      'the curation count reads through the status ledger — hot_memories is gone (#38)',
    );
    // 100% coverage: the column ledger counts EVERY memory over every
    // status — the superseded log's head still counts log, and the
    // 'unclassified' debt appears like any other kind (#31).
    assert.deepEqual(report.memories_by_kind, {
      log: 2,
      note: 3,
      unclassified: 1,
    });
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
    kind: 'decision',
    summary: 'alpha condensed',
  });
  const b = store.store('beta note', { kind: 'note' });
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
      const beta = store.list().find((memory) => memory.content === 'beta note')!.id;
      assert.equal(got!.relations.out[0]!.to_id, beta, 'the raw edge is served, target-less');
      assert.equal(got!.relations.out[0]!.target, null);

      const report = store.checkin();
      assert.equal(report.hot.length, 1);
      assert.equal(report.hot[0]!.id, found[0]!.id, 'the hot block serves through ro too');

      assert.equal(store.stats().memories_by_status['hot'], 1);
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});
