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

/** The edges' serving order is deterministic (#40): `created_at DESC`,
 * then the lexicographic key, then `kind`. The seeding therefore needs no
 * millisecond spins — the depth tests pin behavior that is order-agnostic
 * (single-edge blocks) or reads the served order as given. */
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

test('get: depth 1 (default) projects raw edges — targets stay null', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    store.link(a, b, 'references');

    const node = store.get(a)!;
    assert.equal(node.relations.out.length, 1);
    assert.equal(node.relations.out[0]!.to_id, b);
    assert.equal(node.relations.out[0]!.target, null);

    const explicit = store.get(a, { depth: 1 })!;
    assert.equal(explicit.relations.out[0]!.target, null);
  } finally {
    cleanup();
  }
});

test('get: depth 2 expands the out tree — the target node carries its own block', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note', summary: 'b condensed' });
    const c = store.store('memory c', { kind: 'note' });
    store.link(a, b, 'references');
    store.link(b, c, 'extends');

    const node = store.get(a, { depth: 2 })!;
    const bNode = node.relations.out[0]!.target!;
    assert.equal(bNode.id, b);
    assert.equal(bNode.content, 'memory b');
    assert.equal(bNode.summary, 'b condensed');
    assert.equal(bNode.status, 'active', 'born active — curation is never at birth');

    // *out expands, in informs*: b's own out edge is a raw row at the
    // remaining depth, its in block carries the edge back to the root.
    assert.equal(bNode.relations.out[0]!.kind, 'extends');
    assert.equal(bNode.relations.out[0]!.to_id, c);
    assert.equal(bNode.relations.out[0]!.target, null, 'depth exhausted');
    assert.equal(bNode.relations.in[0]!.from_id, a);
    assert.equal('target' in bNode.relations.in[0]!, false);
  } finally {
    cleanup();
  }
});

test('get: out expands while in stays a raw list at every depth', async () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    const c = store.store('memory c', { kind: 'note' });
    const d = store.store('watcher', { kind: 'note' });
    store.link(a, b, 'references');
    store.link(b, c, 'extends');
    // c's two in-edges must not share a millisecond: same-ms ties order
    // by from_id — random UUIDs, a coin toss per runner (#34 family, and
    // it fired on CI). The newer edge must be newer for real.
    const gate = Date.now() + 2;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
    store.link(d, c, 'cites'); // c's incoming edge never expands

    const node = store.get(a, { depth: 5 })!;
    const cNode = node.relations.out[0]!.target!.relations.out[0]!.target!;
    assert.equal(cNode.id, c);
    assert.equal('target' in cNode.relations.in[0]!, false);
    assert.equal(cNode.relations.in[0]!.from_id, d);
    assert.equal(cNode.relations.in[0]!.kind, 'cites');
  } finally {
    cleanup();
  }
});

test('get: the visited set expands a diamond target once — later occurrences are leaves', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    const c = store.store('memory c', { kind: 'note' });
    const d = store.store('diamond', { kind: 'note' });
    store.link(b, d, 'first');
    store.link(c, d, 'second');
    store.link(a, b, 'references');
    store.link(a, c, 'references');

    const node = store.get(a, { depth: 4 })!;
    const outEdges = node.relations.out;
    assert.equal(outEdges.length, 2);
    assertServingOrder(
      outEdges.map((edge) => ({ created_at: edge.created_at, id: edge.to_id })),
      "a's out block serves in the deterministic edge order (#40)",
    );
    // The projection walks the served order: the first-served edge expands
    // d (depth remaining, d unvisited); the second walks into d afterwards
    // and the visited set renders it a leaf. WHICH edge goes first is the
    // serving order's business — the visited-set behavior is the pin.
    const firstExpanded = outEdges[0]!.target!;
    const secondWalked = outEdges[1]!.target!;
    assert.equal(firstExpanded.relations.out[0]!.target!.id, d, 'the first-served edge expands d');
    assert.equal(secondWalked.relations.out[0]!.target, null, 'd already expanded once — a leaf');
  } finally {
    cleanup();
  }
});

test('get: a cycle terminates — the back edge renders its already-seen node a leaf', () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store('memory a', { kind: 'note' });
    const b = store.store('memory b', { kind: 'note' });
    const c = store.store('memory c', { kind: 'note' });
    store.link(a, b, 'next');
    store.link(b, c, 'next');
    store.link(c, b, 'back'); // the cycle: c -> b

    const node = store.get(a, { depth: 10 })!;
    const bNode = node.relations.out[0]!.target!;
    const cNode = bNode.relations.out[0]!.target!;
    assert.equal(cNode.id, c);
    assert.equal(cNode.relations.out[0]!.to_id, b);
    assert.equal(cNode.relations.out[0]!.target, null, 'b was already expanded');
  } finally {
    cleanup();
  }
});

test('get: no hard cap — a long chain is walked to its end', () => {
  const { store, cleanup } = tempStore();
  try {
    const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((name) =>
      store.store(`memory ${name}`, { kind: 'note' }),
    );
    for (let i = 0; i < ids.length - 1; i++) {
      store.link(ids[i]!, ids[i + 1]!, 'next');
    }

    let node = store.get(ids[0]!, { depth: 10 })!;
    for (let i = 1; i < ids.length; i++) {
      node = node.relations.out[0]!.target!;
      assert.equal(node.id, ids[i]);
    }
    assert.equal(node.relations.out.length, 0, 'the chain ends');
  } finally {
    cleanup();
  }
});

test('get: depth must be an integer >= 1', () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store('memory', { kind: 'note' });
    assert.throws(() => store.get(id, { depth: 0 }), /depth must be an integer >= 1/);
    assert.throws(() => store.get(id, { depth: -2 }), /depth must be an integer >= 1/);
    assert.throws(() => store.get(id, { depth: 1.5 }), /depth must be an integer >= 1/);
  } finally {
    cleanup();
  }
});
