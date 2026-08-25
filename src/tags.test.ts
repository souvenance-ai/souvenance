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

test("tags: empty store returns []", () => {
  const { store, cleanup } = tempStore();
  try {
    assert.deepEqual(store.tags(), []);
  } finally {
    cleanup();
  }
});

test("tags: tags with counts", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["alpha", "beta"] } });
    store.store("m2", { metadata: { tags: ["alpha", "gamma"] } });
    store.store("m3", { metadata: { tags: ["beta"] } });
    const result = store.tags();
    assert.equal(result.length, 3);
    const map = new Map(result.map((r) => [r.tag, r.count]));
    assert.equal(map.get("alpha"), 2);
    assert.equal(map.get("beta"), 2);
    assert.equal(map.get("gamma"), 1);
  } finally {
    cleanup();
  }
});

test("tags: ordering count DESC, tag ASC", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["zebra"] } });
    store.store("m2", { metadata: { tags: ["alpha"] } });
    store.store("m3", { metadata: { tags: ["alpha", "zebra"] } });
    store.store("m4", { metadata: { tags: ["mango"] } });
    store.store("m5", { metadata: { tags: ["alpha", "mango"] } });
    const result = store.tags();
    // alpha: 3, mango: 2, zebra: 2 → count DESC, tag ASC tiebreak
    assert.equal(result[0]!.tag, "alpha");
    assert.equal(result[0]!.count, 3);
    assert.equal(result[1]!.tag, "mango");
    assert.equal(result[1]!.count, 2);
    assert.equal(result[2]!.tag, "zebra");
    assert.equal(result[2]!.count, 2);
  } finally {
    cleanup();
  }
});

test("tags: memories without tags key are excluded", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["alpha"] } });
    store.store("m2", { metadata: { kind: "note" } });
    const result = store.tags();
    assert.equal(result.length, 1);
    assert.equal(result[0]!.tag, "alpha");
    assert.equal(result[0]!.count, 1);
  } finally {
    cleanup();
  }
});

test("tags: memories with null metadata are excluded", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["alpha"] } });
    store.store("m2");
    const result = store.tags();
    assert.equal(result.length, 1);
    assert.equal(result[0]!.tag, "alpha");
    assert.equal(result[0]!.count, 1);
  } finally {
    cleanup();
  }
});

test("tags: non-array tags are excluded (json_type guard)", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["alpha"] } });
    store.store("m2", { metadata: { tags: "not-an-array" } });
    store.store("m3", { metadata: { tags: 42 } });
    const result = store.tags();
    assert.equal(result.length, 1);
    assert.equal(result[0]!.tag, "alpha");
    assert.equal(result[0]!.count, 1);
  } finally {
    cleanup();
  }
});

test("tags: --where filter works", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["shared", "finding"], kind: "finding" } });
    store.store("m2", { metadata: { tags: ["shared", "note"], kind: "note" } });
    store.store("m3", { metadata: { tags: ["finding"], kind: "finding" } });
    const result = store.tags({ where: "metadata->>'$.kind' = 'finding'" });
    const map = new Map(result.map((r) => [r.tag, r.count]));
    assert.equal(map.get("shared"), 1);
    assert.equal(map.get("finding"), 2);
    assert.equal(map.get("note"), undefined);
  } finally {
    cleanup();
  }
});

test("tags: aggregate across memories correctly", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["animal"] } });
    store.store("m2", { metadata: { tags: ["animal"] } });
    store.store("m3", { metadata: { tags: ["animal"] } });
    const result = store.tags();
    assert.equal(result.length, 1);
    assert.equal(result[0]!.tag, "animal");
    assert.equal(result[0]!.count, 3);
  } finally {
    cleanup();
  }
});

test("tags: duplicate tags in one memory count per json_each row", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("m1", { metadata: { tags: ["a", "a"] } });
    const result = store.tags();
    // json_each produces 2 rows for ["a","a"], so count = 2.
    // This documents the per-row behavior; tags arrays should not contain duplicates.
    assert.equal(result.length, 1);
    assert.equal(result[0]!.tag, "a");
    assert.equal(result[0]!.count, 2);
  } finally {
    cleanup();
  }
});

test("tags: defaults to active memories only", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("m1", { metadata: { tags: ["alpha"] } });
    store.store("m2", { metadata: { tags: ["alpha", "beta"] } });
    store.deprecate(a);
    const result = store.tags();
    const map = new Map(result.map((r) => [r.tag, r.count]));
    assert.equal(map.get("alpha"), 1);
    assert.equal(map.get("beta"), 1);
  } finally {
    cleanup();
  }
});

test("tags: includeLegacy includes deprecated memories", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("m1", { metadata: { tags: ["alpha"] } });
    store.store("m2", { metadata: { tags: ["alpha", "beta"] } });
    store.deprecate(a);
    const result = store.tags({ includeLegacy: true });
    const map = new Map(result.map((r) => [r.tag, r.count]));
    assert.equal(map.get("alpha"), 2);
    assert.equal(map.get("beta"), 1);
  } finally {
    cleanup();
  }
});
