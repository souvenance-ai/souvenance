import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store, sanitizeFtsQuery, ftsErrorFromQuery } from "./db.ts";

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-test-"));
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
  const dir = mkdtempSync(join(tmpdir(), "souvenance-test-"));
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
      "INSERT INTO memories (id, content, metadata, created_at, weight) VALUES (?, ?, ?, ?, ?)",
    ).run("a1", "hello world", null, new Date().toISOString(), 0.5);
    db.prepare(
      "INSERT INTO memories (id, content, metadata, created_at, weight) VALUES (?, ?, ?, ?, ?)",
    ).run("a2", "goodbye cruel world", null, new Date().toISOString(), 0.5);

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
    db.prepare("INSERT INTO memories (id, content, metadata, created_at, weight) VALUES (?, ?, ?, ?, ?)").run("a1", "one", null, now, 0.5);
    db.prepare("INSERT INTO memories (id, content, metadata, created_at, weight) VALUES (?, ?, ?, ?, ?)").run("a2", "two", null, now, 0.5);
    db.prepare("INSERT INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)").run("a1", "a2", "references", null, now);

    db.prepare("DELETE FROM memories WHERE id = ?").run("a1");
    const edges = db.prepare("SELECT count(*) as c FROM edges").get() as { c: number };
    assert.equal(edges.c, 0);
  } finally {
    cleanup();
  }
});

test("search: sanitizes FTS5 syntax errors as a fallback", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("weight meaning: importance scale 0.9 vs 0.5, a 0.9 weight is a constraint");
    store.store("token glue: better-sqlite3 and node:sqlite identifiers");

    // dotted numerics — failed with 'fts5: syntax error near "."' before the fix
    const dotted = store.search("0.9 vs 0.5");
    assert.ok(dotted.length >= 1, "dotted numerics should be sanitized into searchable tokens");
    assert.ok(dotted.some((r) => r.content.includes("0.9 vs 0.5")), "should hit the weight memory");

    // hyphenated identifier — also failed before the fix
    const hyphen = store.search("better-sqlite3");
    assert.ok(hyphen.length >= 1, "hyphenated tokens should be split and matched");
    assert.ok(hyphen.some((r) => r.content.includes("better-sqlite3")), "should hit the glue memory");

    // valid queries keep working untouched (fallback must never run on them)
    store.store("apple fruit");
    store.store("banana fruit");
    const either = store.search("apple OR banana");
    assert.equal(either.length, 2, "OR operator preserved");
    const phrase = store.search('"apple fruit"');
    assert.equal(phrase.length, 1, "quoted phrase preserved");

    // nothing sanitizable -> the original error still surfaces
    assert.throws(() => store.search("((("), /fts5: syntax error/);
  } finally {
    cleanup();
  }
});

test("sanitizeFtsQuery strips punctuation, keeps operators and phrases", () => {
  assert.equal(sanitizeFtsQuery("0.9 rule"), "0 9 rule");
  assert.equal(sanitizeFtsQuery("better-sqlite3"), "better sqlite3");
  assert.equal(sanitizeFtsQuery("node:sqlite"), "node sqlite");
  assert.equal(sanitizeFtsQuery("apple OR banana"), "apple OR banana");
  assert.equal(sanitizeFtsQuery('"design alternatives" rejected'), '"design alternatives" rejected');
  assert.equal(sanitizeFtsQuery("((("), null);
});

test("ftsErrorFromQuery trusts 'no such column' only when the tail came from the query", () => {
  assert.equal(ftsErrorFromQuery(new Error('fts5: syntax error near "."'), "0.9 rule"), true);
  assert.equal(ftsErrorFromQuery(new Error('no such column: sqlite3'), "better-sqlite3"), true);
  assert.equal(ftsErrorFromQuery(new Error('no such column: nope'), "anything"), false);
  assert.equal(ftsErrorFromQuery({ message: "no such column: x" }, "x"), false, "non-Error objects ignored");
  assert.equal(ftsErrorFromQuery(new Error("some other failure"), "anything"), false);
});
