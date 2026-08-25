import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seed(store: Store): { a: string; b: string; c: string } {
  const a = store.store("The quick brown fox jumps", {
    metadata: { tags: ["animal"], kind: "note" },
  });
  const b = store.store("Hello world from the fox", {
    metadata: { tags: ["greeting"], kind: "log" },
  });
  const c = store.store("A lazy dog sleeps", {
    metadata: { tags: ["animal"], kind: "note" },
  });
  store.link(a, b, "references");
  store.link(b, c, "extends");
  return { a, b, c };
}

test("search: returns ranked FTS5 results", () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search("fox");
    assert.ok(results.length >= 2);
    for (const r of results) {
      assert.ok("id" in r);
      assert.ok("content" in r);
      assert.ok("metadata" in r);
      assert.ok("created_at" in r);
      assert.ok("rank" in r);
      assert.ok(typeof r.rank === "number");
    }
  } finally {
    cleanup();
  }
});

test("search: bm25 ranking puts the best match first", () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search("fox");
    assert.ok(results.length >= 2);
    const first = results[0]!;
    assert.ok(
      first.content.toLowerCase().includes("fox"),
      "top result should contain the query term",
    );
  } finally {
    cleanup();
  }
});

test("search: respects limit", () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search("fox", { limit: 1 });
    assert.equal(results.length, 1);
  } finally {
    cleanup();
  }
});

test("search: default limit is 20", () => {
  const { store, cleanup } = tempStore();
  try {
    for (let i = 0; i < 25; i++) {
      store.store(`memory number ${i} with fox`);
    }
    const results = store.search("fox");
    assert.equal(results.length, 20);
  } finally {
    cleanup();
  }
});

test("search: applies where filter on metadata JSON path", () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.search("fox", {
      where: `metadata->>'$.kind' = 'note'`,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.metadata?.["kind"], "note");
  } finally {
    cleanup();
  }
});

test("search: throws on empty query", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.search(""), /query must be non-empty/);
  } finally {
    cleanup();
  }
});

test("search: deserializes metadata JSON", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("searchable text", { metadata: { tags: ["x"] } });
    const results = store.search("searchable");
    assert.equal(results.length, 1);
    assert.deepEqual(results[0]!.metadata, { tags: ["x"] });
  } finally {
    cleanup();
  }
});

test("search: returns null metadata as null", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("searchable text");
    const results = store.search("searchable");
    assert.equal(results.length, 1);
    assert.equal(results[0]!.metadata, null);
  } finally {
    cleanup();
  }
});

test("get: returns a memory by id", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("hello world", { metadata: { tags: ["a"] } });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.id, id);
    assert.equal(m!.content, "hello world");
    assert.deepEqual(m!.metadata, { tags: ["a"] });
    assert.ok(typeof m!.created_at === "string");
  } finally {
    cleanup();
  }
});

test("get: returns null for unknown id", () => {
  const { store, cleanup } = tempStore();
  try {
    const m = store.get("nonexistent-id");
    assert.equal(m, null);
  } finally {
    cleanup();
  }
});

test("get: returns null metadata as null", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("no metadata");
    const m = store.get(id);
    assert.equal(m!.metadata, null);
  } finally {
    cleanup();
  }
});

test("list: returns memories ordered by created_at DESC", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, c } = seed(store);
    const results = store.list();
    assert.equal(results.length, 3);
    assert.equal(results[0]!.id, c, "most recent should be first");
    assert.equal(results[2]!.id, a, "oldest should be last");
  } finally {
    cleanup();
  }
});

test("list: respects limit and offset", () => {
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

test("list: default limit is 20", () => {
  const { store, cleanup } = tempStore();
  try {
    for (let i = 0; i < 25; i++) {
      store.store(`memory ${i}`);
    }
    const results = store.list();
    assert.equal(results.length, 20);
  } finally {
    cleanup();
  }
});

test("list: applies where filter on metadata", () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const results = store.list({ where: `metadata->>'$.kind' = 'note'` });
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.metadata?.["kind"], "note");
    }
  } finally {
    cleanup();
  }
});

test("list: deserializes metadata JSON", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("content", { metadata: { tags: ["a"] } });
    const results = store.list();
    assert.deepEqual(results[0]!.metadata, { tags: ["a"] });
  } finally {
    cleanup();
  }
});

test("list: returns empty array when no memories", () => {
  const { store, cleanup } = tempStore();
  try {
    const results = store.list();
    assert.deepEqual(results, []);
  } finally {
    cleanup();
  }
});

test("relations: returns both in and out edges by default direction both", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b, c } = seed(store);
    const rels = store.relations(b);
    assert.equal(rels.length, 2, "b has 1 out (b->c) + 1 in (a->b)");
    const outRels = rels.filter((r) => r.from_id === b);
    assert.equal(outRels.length, 1);
    assert.equal(outRels[0]!.to_id, c);
    assert.equal(outRels[0]!.kind, "extends");
    const inRels = rels.filter((r) => r.to_id === b);
    assert.equal(inRels.length, 1);
    assert.equal(inRels[0]!.from_id, a);
    assert.equal(inRels[0]!.kind, "references");  } finally {
    cleanup();
  }
});

test("relations: direction out returns only outgoing edges", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = seed(store);
    const rels = store.relations(a, { direction: "out" });
    assert.equal(rels.length, 1);
    assert.equal(rels[0]!.from_id, a);
    assert.equal(rels[0]!.to_id, b);
    assert.equal(rels[0]!.kind, "references");
  } finally {
    cleanup();
  }
});

test("relations: direction in returns only incoming edges", () => {
  const { store, cleanup } = tempStore();
  try {
    const { b, c } = seed(store);
    const rels = store.relations(c, { direction: "in" });
    assert.equal(rels.length, 1);
    assert.equal(rels[0]!.from_id, b);
    assert.equal(rels[0]!.to_id, c);
    assert.equal(rels[0]!.kind, "extends");
  } finally {
    cleanup();
  }
});

test("relations: includes metadata and created_at", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    store.link(a, b, "references", { metadata: { weight: 0.9 } });
    const rels = store.relations(a, { direction: "out" });
    assert.equal(rels.length, 1);
    assert.deepEqual(rels[0]!.metadata, { weight: 0.9 });
    assert.ok(typeof rels[0]!.created_at === "string");
  } finally {
    cleanup();
  }
});

test("relations: throws on unknown id", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.relations("nope"), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test("relations: returns empty array when no edges", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("lonely memory");
    const rels = store.relations(id);
    assert.deepEqual(rels, []);
  } finally {
    cleanup();
  }
});

test("stats: returns total counts and edges_by_kind breakdown", () => {
  const { store, cleanup } = tempStore();
  try {
    seed(store);
    const s = store.stats();
    assert.equal(s.memories, 3);
    assert.equal(s.edges, 2);
    assert.equal(s.edges_by_kind["references"], 1);
    assert.equal(s.edges_by_kind["extends"], 1);
  } finally {
    cleanup();
  }
});

test("stats: returns empty counts on a fresh store", () => {
  const { store, cleanup } = tempStore();
  try {
    const s = store.stats();
    assert.equal(s.memories, 0);
    assert.equal(s.edges, 0);
    assert.deepEqual(s.edges_by_kind, {});
  } finally {
    cleanup();
  }
});

test("stats: counts update after deletion", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = seed(store);
    store.delete(a);
    const s = store.stats();
    assert.equal(s.memories, 2);
    assert.equal(s.edges, 1, "cascade should remove a's edge");
    assert.equal(s.edges_by_kind["references"], undefined);
    assert.equal(s.edges_by_kind["extends"], 1);
  } finally {
    cleanup();
  }
});
