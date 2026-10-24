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

/** The store's created_at has millisecond precision — back-to-back store()
 * calls can land in the same ms and make created_at DESC ties undefined
 * (see store.reads.test.ts). Checkin pins the serving order, so seeding
 * spins to the next millisecond between writes. */
function advanceMs(): void {
  const t0 = Date.now();
  while (Date.now() === t0) {}
}

test('checkin: serves the curated hot block, newest first, relations included', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('standing directive', {
      metadata: { kind: 'note', tags: ['context'] },
      summary: 'the directive, condensed',
    });
    advanceMs();
    const b = store.store('another hot note');
    advanceMs();
    store.setHot(a, true);
    store.setHot(b, true);
    store.link(a, b, 'extends');

    const report = store.checkin();
    assert.equal(report.hot.length, 2);
    assert.equal(report.hot[0]!.id, b, 'newest first');
    assert.equal(report.hot[1]!.id, a);

    // Zero drill-in: the block carries content, the authored summary and
    // the depth-1 relations out of the box.
    const aNode = report.hot[1]!;
    assert.equal(aNode.content, 'standing directive');
    assert.equal(aNode.summary, 'the directive, condensed');
    assert.equal(aNode.relations.out[0]!.kind, 'extends');
    assert.equal(aNode.relations.out[0]!.to_id, b);
    assert.equal(aNode.relations.out[0]!.target, null);
    assert.equal(aNode.relations.in.length, 0);
  } finally {
    cleanup();
  }
});

test('checkin: the flag is the whole basket — nothing implicit surfaces', () => {
  const { store, cleanup } = tempStore();
  try {
    // kind never implies hot: an unsetHot directive is invisible.
    store.store('a cold directive', { metadata: { kind: 'directive' } });
    // deprecation cools.
    const cooled = store.store('a cooled directive', { metadata: { kind: 'directive' } });
    store.setHot(cooled, true);
    store.deprecate(cooled);
    // supersede transfers: the head arrives hot, the tail cools.
    const stale = store.store('a stale head');
    store.setHot(stale, true);
    const head = store.supersede(stale, 'the revision');

    assert.deepEqual(
      store.checkin().hot.map((m) => m.id),
      [head],
    );
  } finally {
    cleanup();
  }
});

test('checkin: merge unions the hot curation', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a');
    store.setHot(a, true);
    const b = store.store('memory b');
    const head = store.merge([a, b], 'the fusion');
    assert.deepEqual(
      store.checkin().hot.map((m) => m.id),
      [head],
    );
  } finally {
    cleanup();
  }
});

test('checkin: no cap by default — the limit opt guides attention', () => {
  const { store, cleanup } = tempStore();
  try {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      advanceMs();
      ids.push(store.store(`hot memory ${i}`));
      store.setHot(ids[i]!, true);
    }
    assert.equal(store.checkin().hot.length, 5);
    const capped = store.checkin({ limit: 2 });
    assert.equal(capped.hot.length, 2);
    assert.equal(capped.hot[0]!.id, ids[4]!, 'still newest first under the cap');
  } finally {
    cleanup();
  }
});

test('checkin: limit must be an integer >= 1', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.checkin({ limit: 0 }), /limit must be an integer >= 1/);
    assert.throws(() => store.checkin({ limit: 1.5 }), /limit must be an integer >= 1/);
  } finally {
    cleanup();
  }
});

test('checkin: an empty store serves an empty block and zero stats', () => {
  const { store, cleanup } = tempStore();
  try {
    const report = store.checkin();
    assert.deepEqual(report.hot, []);
    assert.equal(report.stats.memories, 0);
    assert.equal(report.stats.hot_memories, 0);
    assert.equal(report.stats.edges, 0);
  } finally {
    cleanup();
  }
});
