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

/**
 * The serving-order contract (#40), pinned here for the hot block: the
 * sequence is strictly decreasing in the (created_at, id) lexicographic
 * key — the ms-tie broken by the UUID. Whatever the clock did between two
 * store() calls, the order is defined.
 */
function assertServingOrder(
  nodes: readonly { readonly created_at: string; readonly id: string }[],
  detail?: string,
): void {
  for (let index = 1; index < nodes.length; index++) {
    const previous = nodes[index - 1]!;
    const current = nodes[index]!;
    const ordered =
      previous.created_at !== current.created_at
        ? previous.created_at > current.created_at
        : previous.id > current.id;
    assert.ok(
      ordered,
      `${detail ? detail + ' — ' : ''}serving order violated: (${previous.created_at}, ${previous.id}) then (${current.created_at}, ${current.id})`,
    );
  }
}

test('checkin: serves the curated hot block, newest first, relations included', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('standing directive', {
      kind: 'note',
      metadata: { tag: 'context' },
      summary: 'the directive, condensed',
    });
    const b = store.store('another hot note', { kind: 'note' });
    store.setHot(a, true);
    store.setHot(b, true);
    store.link(a, b, 'extends');

    const report = store.checkin();
    assert.equal(report.hot.length, 2);
    assertServingOrder(report.hot);
    assert.ok(report.hot.some((memory) => memory.id === b));

    // Zero drill-in: the block carries content, the authored summary and
    // the depth-1 relations out of the box.
    const aNode = report.hot.find((memory) => memory.id === a)!;
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

test('checkin: the hot status is the whole basket — nothing implicit surfaces', () => {
  const { store, cleanup } = tempStore();
  try {
    // kind never implies hot: an uncurated directive is invisible.
    store.store('a cold directive', { kind: 'directive' });
    // deprecation cools.
    const cooled = store.store('a cooled directive', { kind: 'directive' });
    store.setHot(cooled, true);
    store.deprecate(cooled);
    // supersede transfers: the head arrives hot, the tail cools.
    const stale = store.store('a stale head', { kind: 'note' });
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
    const a = store.store('memory a', { kind: 'note' });
    store.setHot(a, true);
    const b = store.store('memory b', { kind: 'note' });
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
      ids.push(store.store(`hot memory ${i}`, { kind: 'note' }));
      store.setHot(ids[i]!, true);
    }
    const full = store.checkin().hot;
    assert.equal(full.length, 5);
    assertServingOrder(full);
    const capped = store.checkin({ limit: 2 });
    assert.deepEqual(
      capped.hot.map((memory) => memory.id),
      full.slice(0, 2).map((memory) => memory.id),
      "the cap serves the block's head — never a different subset",
    );
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
    assert.equal(report.stats.memories_by_status['hot'] ?? 0, 0);
    assert.equal(report.stats.edges, 0);
  } finally {
    cleanup();
  }
});
