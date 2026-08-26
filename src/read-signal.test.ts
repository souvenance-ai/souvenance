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

test("access_count: defaults to 0 on new memory", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("fresh memory");
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.access_count, 0);
  } finally {
    cleanup();
  }
});

test("access_count: get increments by 1", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("read me");
    store.get(id);
    store.get(id);
    store.get(id);
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.access_count, 3);
  } finally {
    cleanup();
  }
});

test("access_count: get returns the count BEFORE this get", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("read me once");
    const m1 = store.get(id);
    assert.equal(m1!.access_count, 0);
    const m2 = store.get(id);
    assert.equal(m2!.access_count, 1);
  } finally {
    cleanup();
  }
});

test("access_count: search increments by 1/N (fractional)", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("fox alpha");
    store.store("fox beta");
    store.search("fox");
    const m = store.get(a);
    assert.ok(m);
    assert.equal(m!.access_count, 0.5, "each result should get 1/2 = 0.5 from a 2-result search");
  } finally {
    cleanup();
  }
});

test("access_count: single-result search increments by 1", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("unique fox");
    store.search("fox");
    const m = store.get(id);
    assert.ok(m);
    assert.equal(m!.access_count, 1, "1-result search should give +1 to the only result");
  } finally {
    cleanup();
  }
});

test("access_count: search results include access_count field", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("searchable fox");
    const results = store.search("fox");
    assert.equal(results.length, 1);
    assert.ok("access_count" in results[0]!, "search results should include access_count");
    assert.equal(results[0]!.access_count, 0);
  } finally {
    cleanup();
  }
});

test("access_count: list results include access_count field", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("a memory");
    const results = store.list();
    assert.equal(results.length, 1);
    assert.ok("access_count" in results[0]!, "list results should include access_count");
    assert.equal(results[0]!.access_count, 0);
  } finally {
    cleanup();
  }
});

test("access_count: stats includes total_accesses", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("memory");
    store.get(id);
    store.get(id);
    const s = store.stats();
    assert.ok("total_accesses" in s, "stats should include total_accesses");
    assert.equal(s.total_accesses, 2);
  } finally {
    cleanup();
  }
});

test("access_count: migration backfills existing memories to 0", () => {
  const { store, cleanup } = tempStore();
  try {
    const id = store.store("existing memory");
    const m = store.get(id);
    assert.equal(m!.access_count, 0);
  } finally {
    cleanup();
  }
});

test("search: access_count boosts frequently-accessed memories in ranking", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("fox content one");
    store.store("fox content two");

    for (let i = 0; i < 10; i++) store.get(a);
    const results = store.search("fox");
    assert.equal(results.length, 2);
    assert.equal(
      results[0]!.id, a,
      "frequently-accessed memory should rank higher despite same bm25 and recency",
    );
  } finally {
    cleanup();
  }
});

test("search: access_count does not override strong bm25 signal", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("fox fox fox fox fox");
    store.store("fox once");

    for (let i = 0; i < 5; i++) store.get(a);

    const results = store.search("fox");
    assert.equal(results.length, 2);
    assert.equal(
      results[0]!.id, a,
      "stronger bm25 match should still rank higher than a boosted weaker match",
    );
  } finally {
    cleanup();
  }
});

test("search: multiple searches accumulate fractional access_count", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("fox alpha");
    store.store("fox beta");
    store.search("fox");
    store.search("fox");
    store.search("fox");
    const m = store.get(a);
    assert.ok(m);
    assert.equal(m!.access_count, 1.5, "3 searches × 1/2 each = 1.5");
  } finally {
    cleanup();
  }
});
