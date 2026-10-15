import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SQLInputValue } from "node:sqlite";
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

function row<T>(store: Store, sql: string, ...params: SQLInputValue[]): T {
  return store.db.prepare(sql).get(...params) as T;
}

function uuidRegex(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

test("store: inserts a memory with UUID id and returns it", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("hello world", { metadata: { tags: ["a"] } });
    assert.ok(uuidRegex(id), `id should be a UUID v4, got: ${id}`);

    const m = row<{ id: string; content: string; metadata: string | null }>(
      store,
      "SELECT id, content, metadata FROM memories WHERE id = ?",
      id,
    );
    assert.equal(m.id, id);
    assert.equal(m.content, "hello world");
    assert.deepEqual(JSON.parse(m.metadata!), { tags: ["a"] });
  } finally {
    cleanup();
  }
});

test("store: works without metadata", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("no metadata here");
    const m = row<{ content: string; metadata: string | null }>(
      store,
      "SELECT content, metadata FROM memories WHERE id = ?",
      id,
    );
    assert.equal(m.content, "no metadata here");
    assert.equal(m.metadata, null);
  } finally {
    cleanup();
  }
});

test("store: throws on empty content", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.store(""), /content must be non-empty/);
  } finally {
    cleanup();
  }
});

test("store: FTS index stays in sync after insert", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("the quick brown fox");
    const fts = row<{ c: number }>(
      store,
      "SELECT count(*) as c FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?",
      "fox",
    );
    assert.equal(fts.c, 1);
  } finally {
    cleanup();
  }
});

test("update: changes metadata", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content", { metadata: { tags: ["a"] } });
    store.update(id, { metadata: { tags: ["b"], kind: "note" } });

    const m = row<{ metadata: string | null }>(
      store,
      "SELECT metadata FROM memories WHERE id = ?",
      id,
    );
    assert.deepEqual(JSON.parse(m.metadata!), { tags: ["b"], kind: "note" });
  } finally {
    cleanup();
  }
});

test("update: throws on unknown id", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(
      () => store.update("nope", { metadata: { tags: ["x"] } }),
      /memory not found: nope/,
    );
  } finally {
    cleanup();
  }
});

test("supersede: stores new memory, links old, marks old as superseded", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("hello world");
    const newId = store.supersede(oldId, "hello universe");

    assert.ok(uuidRegex(newId), "new id should be a UUID");

    const oldMem = store.get(oldId);
    assert.ok(oldMem);
    assert.equal(oldMem!.status, "superseded");

    const newMem = store.get(newId);
    assert.ok(newMem);
    assert.equal(newMem!.content, "hello universe");
    assert.equal(newMem!.status, "active");

    const rels = store.relations(oldId, { direction: "out" });
    assert.equal(rels.length, 1);
    assert.equal(rels[0]!.kind, "supersedes");
    assert.equal(rels[0]!.to_id, newId);
  } finally {
    cleanup();
  }
});

test("supersede: FTS stays in sync (old excluded from default search, new findable)", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("hello world");
    store.supersede(oldId, "hello universe");

    const defaultResults = store.search("world");
    assert.equal(defaultResults.length, 0, "superseded memory should not appear in default search");

    const legacyResults = store.search("world", { includeLegacy: true });
    assert.equal(legacyResults.length, 1, "superseded memory should appear with includeLegacy");

    const newResults = store.search("universe");
    assert.equal(newResults.length, 1);
    assert.equal(newResults[0]!.status, "active");
  } finally {
    cleanup();
  }
});

test("supersede: stores metadata on the new memory", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("hello world");
    const newId = store.supersede(oldId, "hello universe", {
      metadata: { tags: ["greeting"] },
    });

    const newMem = store.get(newId);
    assert.ok(newMem);
    assert.deepEqual(newMem!.metadata, { tags: ["greeting"] });
  } finally {
    cleanup();
  }
});

test("supersede: inherits kind and tags from the old memory when metadata omitted", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("hello world", {
      metadata: { kind: "note", tags: ["a", "b"], session: 2 },
    });
    const newId = store.supersede(oldId, "hello universe");

    const newMem = store.get(newId);
    assert.ok(newMem);
    // kind and tags are structural and carry; contextual keys do not.
    assert.deepEqual(newMem!.metadata, { kind: "note", tags: ["a", "b"] });
  } finally {
    cleanup();
  }
});

test("supersede: explicit metadata is used verbatim, no inherit", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("hello world", {
      metadata: { kind: "note", tags: ["a"] },
    });
    const newId = store.supersede(oldId, "hello universe", {
      metadata: { kind: "decision" },
    });

    const newMem = store.get(newId);
    assert.ok(newMem);
    assert.deepEqual(newMem!.metadata, { kind: "decision" });
  } finally {
    cleanup();
  }
});

test("supersede: kindless old memory yields kindless successor", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("hello world");
    const newId = store.supersede(oldId, "hello universe");

    const newMem = store.get(newId);
    assert.ok(newMem);
    assert.equal(newMem!.metadata, null);
  } finally {
    cleanup();
  }
});

test("supersede: throws on unknown old id", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(
      () => store.supersede("nope", "new content"),
      /memory not found: nope/,
    );
  } finally {
    cleanup();
  }
});

test("supersede: throws on empty content", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("old content");
    assert.throws(
      () => store.supersede(oldId, ""),
      /content must be non-empty/,
    );
  } finally {
    cleanup();
  }
});

test("supersede: throws when old memory is not active", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("old content");
    store.deprecate(oldId);
    assert.throws(
      () => store.supersede(oldId, "new content"),
      /cannot supersede a memory with status 'deprecated'/,
    );
  } finally {
    cleanup();
  }
});

test("deprecate: marks a memory as deprecated", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("to be deprecated");
    store.deprecate(id);

    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.status, "deprecated");
  } finally {
    cleanup();
  }
});

test("deprecate: throws on unknown id", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.deprecate("nope"), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test("deprecate: throws when memory is not active", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content");
    store.deprecate(id);
    assert.throws(
      () => store.deprecate(id),
      /cannot deprecate a memory with status 'deprecated'/,
    );
  } finally {
    cleanup();
  }
});

test("merge: combines memories, marks originals as merged", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    const mergedId = store.merge([a, b], "combined content");

    assert.ok(uuidRegex(mergedId), "merged id should be a UUID");

    const merged = store.get(mergedId);
    assert.ok(merged);
    assert.equal(merged!.content, "combined content");
    assert.equal(merged!.status, "active");

    const memA = store.get(a);
    assert.equal(memA!.status, "merged");
    const memB = store.get(b);
    assert.equal(memB!.status, "merged");

    const relsA = store.relations(a, { direction: "out" });
    assert.equal(relsA.length, 1);
    assert.equal(relsA[0]!.kind, "merges");
    assert.equal(relsA[0]!.to_id, mergedId);

    const relsB = store.relations(b, { direction: "out" });
    assert.equal(relsB.length, 1);
    assert.equal(relsB[0]!.kind, "merges");
    assert.equal(relsB[0]!.to_id, mergedId);
  } finally {
    cleanup();
  }
});

test("merge: stores metadata on the merged memory", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    const mergedId = store.merge([a, b], "combined", {
      metadata: { tags: ["merged"] },
    });

    const merged = store.get(mergedId);
    assert.deepEqual(merged!.metadata, { tags: ["merged"] });
  } finally {
    cleanup();
  }
});

test("merge: inherits kind when every source agrees, unions tags", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("alpha", {
      metadata: { kind: "note", tags: ["x"] },
    });
    const b = store.store("beta", {
      metadata: { kind: "note", tags: ["y", "x"] },
    });
    const id = store.merge([a, b], "alpha beta combined");

    const mem = store.get(id);
    assert.ok(mem);
    assert.deepEqual(mem!.metadata, { kind: "note", tags: ["x", "y"] });
  } finally {
    cleanup();
  }
});

test("merge: divergent kinds are not inherited; tags still union", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("alpha", {
      metadata: { kind: "note", tags: ["x"] },
    });
    const b = store.store("beta", {
      metadata: { kind: "decision", tags: ["y"] },
    });
    const id = store.merge([a, b], "alpha beta combined");

    const mem = store.get(id);
    assert.ok(mem);
    assert.deepEqual(mem!.metadata, { tags: ["x", "y"] });
  } finally {
    cleanup();
  }
});

test("merge: throws on fewer than 2 ids", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("only one");
    assert.throws(
      () => store.merge([a], "content"),
      /merge requires at least 2 memories/,
    );
  } finally {
    cleanup();
  }
});

test("merge: throws on duplicate ids", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    assert.throws(
      () => store.merge([a, a], "content"),
      /duplicate id in merge/,
    );
  } finally {
    cleanup();
  }
});

test("merge: throws on unknown id", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    assert.throws(
      () => store.merge([a, "nope"], "content"),
      /memory not found: nope/,
    );
  } finally {
    cleanup();
  }
});

test("merge: throws on empty content", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    assert.throws(
      () => store.merge([a, b], ""),
      /content must be non-empty/,
    );
  } finally {
    cleanup();
  }
});

test("merge: throws when an original is not active", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    store.deprecate(b);
    assert.throws(
      () => store.merge([a, b], "content"),
      /cannot merge a memory with status 'deprecated'/,
    );
  } finally {
    cleanup();
  }
});

test("delete: removes a memory", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("to be deleted");
    store.delete(id);

    const m = row<{ c: number }>(store, "SELECT count(*) as c FROM memories WHERE id = ?", id);
    assert.equal(m.c, 0);
  } finally {
    cleanup();
  }
});

test("delete: FTS index removes the entry", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("unique searchable text");
    store.delete(id);

    const fts = row<{ c: number }>(
      store,
      "SELECT count(*) as c FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?",
      "unique",
    );
    assert.equal(fts.c, 0);
  } finally {
    cleanup();
  }
});

test("delete: cascades edges via FK", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    store.link(a, b, "references");
    store.delete(a);

    const edges = row<{ c: number }>(store, "SELECT count(*) as c FROM edges");
    assert.equal(edges.c, 0);
  } finally {
    cleanup();
  }
});

test("delete: throws on unknown id", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => store.delete("nope"), /memory not found: nope/);
  } finally {
    cleanup();
  }
});

test("link: creates a typed directed edge", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    store.link(a, b, "references");

    const e = row<{ from_id: string; to_id: string; kind: string; metadata: string | null }>(
      store,
      "SELECT from_id, to_id, kind, metadata FROM edges",
    );
    assert.equal(e.from_id, a);
    assert.equal(e.to_id, b);
    assert.equal(e.kind, "references");
    assert.equal(e.metadata, null);
  } finally {
    cleanup();
  }
});

test("link: stores metadata as JSON", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    store.link(a, b, "references", { metadata: { weight: 0.9 } });

    const e = row<{ metadata: string | null }>(store, "SELECT metadata FROM edges");
    assert.deepEqual(JSON.parse(e.metadata!), { weight: 0.9 });
  } finally {
    cleanup();
  }
});

test("link: duplicate (same from/to/kind) is ignored (idempotent)", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    store.link(a, b, "references");
    store.link(a, b, "references");

    const edges = row<{ c: number }>(store, "SELECT count(*) as c FROM edges");
    assert.equal(edges.c, 1);
  } finally {
    cleanup();
  }
});

test("link: allows different kinds between same pair", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    store.link(a, b, "references");
    store.link(a, b, "extends");

    const edges = row<{ c: number }>(store, "SELECT count(*) as c FROM edges");
    assert.equal(edges.c, 2);
  } finally {
    cleanup();
  }
});

test("link: throws on unknown from_id", () => {
  const { store, cleanup } = tempStore();
  try {
    const b = store.store("memory b");
    assert.throws(
      () => store.link("nope", b, "references"),
      /memory not found: nope/,
    );
  } finally {
    cleanup();
  }
});

test("link: throws on unknown to_id", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    assert.throws(
      () => store.link(a, "nope", "references"),
      /memory not found: nope/,
    );
  } finally {
    cleanup();
  }
});

test("link: throws on empty kind", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    assert.throws(() => store.link(a, b, ""), /kind must be non-empty/);
  } finally {
    cleanup();
  }
});
