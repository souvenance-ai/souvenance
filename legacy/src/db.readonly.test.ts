import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Store } from "./db.ts";

/**
 * Read-only store opens (see .scratch/lib-readonly/). The ro source is a
 * store written read-write and closed cleanly — the realistic consumer
 * scenario, since a ro connection cannot recover a WAL it cannot write.
 */

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "souvenance-ro-"));
}

function seededStorePath(): { path: string; cleanup: () => void } {
  const dir = tempDir();
  const path = join(dir, "memory.db");
  const store = Store.open({ dbPath: path });
  const a = store.store("alpha decision", { metadata: { kind: "decision" }, weight: 0.7 });
  const b = store.store("beta note", { metadata: { kind: "note" } });
  store.link(a, b, "references");
  store.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("read-only open refuses a missing file and creates nothing", () => {
  const dir = tempDir();
  const path = join(dir, "memory.db");
  try {
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /no store at/,
    );
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("read-only open does not create the parent directory", () => {
  const dir = tempDir();
  const path = join(dir, "sub", "memory.db");
  try {
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /no store at/,
    );
    assert.equal(existsSync(join(dir, "sub")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("read-only store serves every read verb", () => {
  const { path, cleanup } = seededStorePath();
  try {
    const store = Store.open({ dbPath: path, readOnly: true });
    try {
      assert.equal(store.readOnly, true);
      assert.equal(store.list().length, 2);
      const found = store.search("alpha");
      assert.equal(found.length, 1);
      const got = store.get(found[0].id);
      assert.ok(got);
      assert.deepEqual(store.relations(found[0].id).map((r) => r.kind), ["references"]);
      assert.deepEqual(store.tags(), []);
      const stats = store.stats();
      assert.equal(stats.active_memories, 2);
      assert.equal(store.doctor().healthy, true);
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});

test("every write verb refuses on a read-only store", () => {
  const { path, cleanup } = seededStorePath();
  try {
    const store = Store.open({ dbPath: path, readOnly: true });
    try {
      const ids = store.list().map((m) => m.id);
      assert.throws(() => store.store("new content"), /read-only/);
      assert.throws(() => store.update(ids[0], { weight: 0.9 }), /read-only/);
      assert.throws(() => store.delete(ids[0]), /read-only/);
      assert.throws(() => store.deprecate(ids[0]), /read-only/);
      assert.throws(
        () => store.link(ids[0], ids[1], "references"),
        /read-only/,
      );
      assert.throws(() => store.supersede(ids[0], "next"), /read-only/);
      assert.throws(() => store.merge(ids.slice(0, 2), "merged"), /read-only/);
      assert.throws(() => store.doctor({ fix: true }), /read-only/);
      assert.equal(store.list().length, 2);
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});

test("read-signal is skipped on a read-only store", () => {
  const { path, cleanup } = seededStorePath();
  try {
    const store = Store.open({ dbPath: path, readOnly: true });
    try {
      const id = store.search("alpha")[0].id;
      const before = store.stats().total_accesses;
      store.search("alpha");
      store.get(id);
      assert.equal(store.stats().total_accesses, before);
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});

test("read-signal still bumps on a read-write store", () => {
  const { path, cleanup } = seededStorePath();
  try {
    const store = Store.open({ dbPath: path });
    try {
      const id = store.search("alpha")[0].id;
      const before = store.stats().total_accesses;
      store.search("alpha");
      store.get(id);
      assert.ok(store.stats().total_accesses > before);
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});

test("read-only open refuses an older-schema store", () => {
  const { path, cleanup } = seededStorePath();
  try {
    const raw = new DatabaseSync(path);
    // schema_version holds one row per applied migration; a v4 store keeps rows 1..4.
    raw.prepare("DELETE FROM schema_version WHERE version > 4").run();
    raw.close();
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /schema version 4 .*open it read-write once to migrate/,
    );
  } finally {
    cleanup();
  }
});

test("read-only open refuses a pre-versioning store", () => {
  const dir = tempDir();
  const path = join(dir, "legacy.db");
  try {
    const raw = new DatabaseSync(path);
    raw.exec("CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL)");
    raw.close();
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /open it read-write once to migrate/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("read-only open refuses an empty (zero-page) file", () => {
  const dir = tempDir();
  const path = join(dir, "empty.db");
  try {
    writeFileSync(path, "");
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /open it read-write once to migrate/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
