import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  return { store, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test("open creates all tables on a fresh project", () => {
  const { store, cleanup } = tempStore();
  try {
    const tables = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    assert.ok(names.includes("memories"));
    assert.ok(names.includes("edges"));
    assert.ok(names.includes("schema_version"));
    assert.ok(names.includes("memories_fts"));
  } finally {
    cleanup();
  }
});

test("reopening is a no-op (schema_version unchanged)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-test-"));
  const path = join(dir, "memory.db");
  try {
    const s1 = Store.open({ dbPath: path });
    const v1 = s1.db.prepare("SELECT version FROM schema_version").get() as { version: number };
    s1.close();
    const s2 = Store.open({ dbPath: path });
    const v2 = s2.db.prepare("SELECT version FROM schema_version").get() as { version: number };
    assert.equal(v2.version, v1.version);
    s2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("WAL and FK pragmas are set", () => {
  const { store, cleanup } = tempStore();
  try {
    const journal = store.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    assert.equal(journal.journal_mode, "wal");
    const fk = store.db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    assert.equal(fk.foreign_keys, 1);
  } finally {
    cleanup();
  }
});

test("FTS5 stays in sync: insert, update, delete", () => {
  const { store, cleanup } = tempStore();
  try {
    const db = store.db;
    db.prepare(
      "INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)",
    ).run("a1", "hello world", null, new Date().toISOString());
    db.prepare(
      "INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)",
    ).run("a2", "goodbye cruel world", null, new Date().toISOString());

    const match = db.prepare(
      "SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ? ORDER BY rank",
    ).all("world") as { id: string }[];
    assert.equal(match.length, 2);

    db.prepare("UPDATE memories SET content = ? WHERE id = ?").run("hello universe", "a1");
    const afterUpdate = db.prepare(
      "SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?",
    ).all("universe") as { id: string }[];
    assert.equal(afterUpdate.length, 1);
    assert.equal(afterUpdate[0]!.id, "a1");

    db.prepare("DELETE FROM memories WHERE id = ?").run("a2");
    const afterDelete = db.prepare(
      "SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?",
    ).all("goodbye") as { id: string }[];
    assert.equal(afterDelete.length, 0);
  } finally {
    cleanup();
  }
});

test("FK cascade: deleting a memory removes its edges", () => {
  const { store, cleanup } = tempStore();
  try {
    const db = store.db;
    const now = new Date().toISOString();
    db.prepare("INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)").run("a1", "one", null, now);
    db.prepare("INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)").run("a2", "two", null, now);
    db.prepare("INSERT INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)").run("a1", "a2", "references", null, now);

    db.prepare("DELETE FROM memories WHERE id = ?").run("a1");
    const edges = db.prepare("SELECT count(*) as c FROM edges").get() as { c: number };
    assert.equal(edges.c, 0);
  } finally {
    cleanup();
  }
});
