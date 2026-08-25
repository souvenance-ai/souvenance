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

test("update: changes content and keeps FTS in sync", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("hello world");
    store.update(id, { content: "hello universe" });

    const m = row<{ content: string }>(
      store,
      "SELECT content FROM memories WHERE id = ?",
      id,
    );
    assert.equal(m.content, "hello universe");

    const oldFts = row<{ c: number }>(
      store,
      "SELECT count(*) as c FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?",
      "world",
    );
    assert.equal(oldFts.c, 0);

    const newFts = row<{ c: number }>(
      store,
      "SELECT count(*) as c FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?",
      "universe",
    );
    assert.equal(newFts.c, 1);
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
      () => store.update("nope", { content: "x" }),
      /memory not found: nope/,
    );
  } finally {
    cleanup();
  }
});

test("update: throws when no fields provided", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content");
    assert.throws(() => store.update(id, {}), /at least one of/);
  } finally {
    cleanup();
  }
});

test("update: throws on empty content", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content");
    assert.throws(() => store.update(id, { content: "" }), /content must be non-empty/);
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
