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

test("store: default weight is 0.5", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("default weight memory");
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 0.5);
  } finally {
    cleanup();
  }
});

test("store: custom weight is stored", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("high weight memory", { weight: 0.9 });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 0.9);
  } finally {
    cleanup();
  }
});

test("store: weight of 0 is allowed", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("zero weight", { weight: 0 });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 0);
  } finally {
    cleanup();
  }
});

test("store: weight of 1 is allowed", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("max weight", { weight: 1 });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 1);
  } finally {
    cleanup();
  }
});

test("supersede: new memory gets specified weight", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("old content", { weight: 0.3 });
    const newId = store.supersede(oldId, "new content", { weight: 0.8 });
    const m = store.get(newId);
    assert.ok(m);
    assert.equal(m!.weight, 0.8);
  } finally {
    cleanup();
  }
});

test("supersede: new memory gets default weight when unspecified", () => {
  const { store, cleanup } = tempStore();
  try {
    const oldId = store.store("old content", { weight: 0.9 });
    const newId = store.supersede(oldId, "new content");
    const m = store.get(newId);
    assert.ok(m);
    assert.equal(m!.weight, 0.5);
  } finally {
    cleanup();
  }
});

test("merge: merged memory gets specified weight", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    const mergedId = store.merge([a, b], "combined", { weight: 0.7 });
    const m = store.get(mergedId);
    assert.ok(m);
    assert.equal(m!.weight, 0.7);
  } finally {
    cleanup();
  }
});

test("merge: merged memory gets default weight when unspecified", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("memory a");
    const b = store.store("memory b");
    const mergedId = store.merge([a, b], "combined");
    const m = store.get(mergedId);
    assert.ok(m);
    assert.equal(m!.weight, 0.5);
  } finally {
    cleanup();
  }
});

test("update: changes weight", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content");
    store.update(id, { weight: 0.95 });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 0.95);
  } finally {
    cleanup();
  }
});

test("update: changes metadata and weight together", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content", { metadata: { kind: "note" } });
    store.update(id, { metadata: { kind: "decision" }, weight: 0.9 });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 0.9);
    assert.equal(m!.metadata?.["kind"], "decision");
  } finally {
    cleanup();
  }
});

test("update: changes weight only (metadata untouched)", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content", { metadata: { kind: "note" } });
    store.update(id, { weight: 0.8 });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 0.8);
    assert.equal(m!.metadata?.["kind"], "note");
  } finally {
    cleanup();
  }
});

test("update: changes metadata only (weight untouched)", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content", { weight: 0.7, metadata: { kind: "note" } });
    store.update(id, { metadata: { kind: "decision" } });
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.weight, 0.7);
    assert.equal(m!.metadata?.["kind"], "decision");
  } finally {
    cleanup();
  }
});

test("update: throws when neither metadata nor weight provided", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("content");
    assert.throws(
      () => store.update(id, {}),
      /update requires at least one of --metadata or --weight/,
    );
  } finally {
    cleanup();
  }
});

test("list: --min-weight filters out low-weight memories", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("low weight", { weight: 0.2 });
    store.store("mid weight", { weight: 0.5 });
    store.store("high weight", { weight: 0.9 });

    const filtered = store.list({ minWeight: 0.5 });
    assert.equal(filtered.length, 2);
    for (const m of filtered) {
      assert.ok(m.weight >= 0.5);
    }
  } finally {
    cleanup();
  }
});

test("list: --min-weight 0 returns all", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("zero", { weight: 0 });
    store.store("half", { weight: 0.5 });
    store.store("one", { weight: 1 });

    const all = store.list({ minWeight: 0 });
    assert.equal(all.length, 3);
  } finally {
    cleanup();
  }
});

test("search: weight affects ranking — higher weight ranks first for same content", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("the quick fox jumps", { weight: 0.1 });
    store.store("the quick fox jumps", { weight: 0.9 });

    const results = store.search("fox");
    assert.equal(results.length, 2);
    assert.ok(results[0]!.weight > results[1]!.weight,
      "higher-weight memory should rank first for identical content");
  } finally {
    cleanup();
  }
});

test("search: results include weight field", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("searchable fox", { weight: 0.7 });
    const results = store.search("fox");
    assert.equal(results.length, 1);
    assert.equal(results[0]!.weight, 0.7);
  } finally {
    cleanup();
  }
});

test("search: zero-weight memory excluded from ranking impact", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("unique fox alpha", { weight: 0 });
    store.store("unique fox beta", { weight: 0.5 });

    const results = store.search("fox");
    assert.equal(results.length, 2);
    const zeroWeight = results.find((r) => r.weight === 0);
    assert.ok(zeroWeight);
    assert.ok(Number.isFinite(zeroWeight!.rank));
  } finally {
    cleanup();
  }
});

test("migration: existing memories get default weight 0.5", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-test-"));
  const path = join(dir, "memory.db");
  try {
    const s1 = Store.open({ dbPath: path });
    s1.db.prepare(
      "INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)",
    ).run("pre-migration", "before weight column", null, new Date().toISOString());
    s1.close();

    const s2 = Store.open({ dbPath: path });
    const row = s2.db
      .prepare("SELECT weight FROM memories WHERE id = ?")
      .get("pre-migration") as { weight: number };
    assert.equal(row.weight, 0.5);
    s2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dump: memories include weight", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("memory with weight", { weight: 0.8 });
    const { memories } = store.dump();
    const all = [...memories];
    assert.equal(all.length, 1);
    assert.equal(all[0]!.weight, 0.8);
  } finally {
    cleanup();
  }
});
