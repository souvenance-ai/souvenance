import type { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 5;

const V1 = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, kind),
  FOREIGN KEY (from_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  content='memories',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;
`;

const V2 = `
ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
`;

const V3 = `
ALTER TABLE memories ADD COLUMN weight REAL NOT NULL DEFAULT 0.5;
`;

const V4 = `
ALTER TABLE memories ADD COLUMN read_count INTEGER NOT NULL DEFAULT 0;
`;

const V5 = `
ALTER TABLE memories RENAME COLUMN read_count TO access_count;
`;

const migrations: Record<number, string> = {
  1: V1,
  2: V2,
  3: V3,
  4: V4,
  5: V5,
};

function ensureVersionTable(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const row = db
    .prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
    .get() as { version: number } | undefined;
  return row?.version ?? 0;
}

/**
 * The store's applied schema version, read WITHOUT creating anything.
 * `ensureVersionTable` writes (CREATE TABLE IF NOT EXISTS), so read-only
 * opens must not use it; this is the pure read. Returns 0 when the table
 * is absent (a pre-versioning store) or unreadable — the ro open refuses.
 */
export function schemaVersion(db: DatabaseSync): number {
  try {
    const row = db
      .prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
      .get() as { version: number } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

export function migrate(db: DatabaseSync): void {
  const current = ensureVersionTable(db);
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    const sql = migrations[v];
    if (!sql) throw new Error(`No migration for schema version ${v}`);
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
      ).run(v, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
