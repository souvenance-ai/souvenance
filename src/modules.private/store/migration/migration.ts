import type { DatabaseSync } from 'node:sqlite';

import { StoreError } from '../store-error/store-error.ts';

export const SCHEMA_VERSION = 6;

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

/**
 * The refonte: `weight` and `access_count` are dropped (agents never leaned
 * on them) and curation becomes a STATUS: `hot` joins the five-state
 * machine (`active | hot | superseded | deprecated | merged`) instead of
 * riding a parallel flag column (#38 — a sub-state that changes three
 * verbs' behavior deserves to be a state). The exact basket the legacy
 * recover served — active directives, summaries, and OPEN objectives —
 * arrives with `status = 'hot'`, so an existing individual checks in with
 * the same memories it always did. The flag column is never added: a v5
 * store has no `hot` column to drop (the flag was the refonte's own
 * invention), and the contradiction it policed (hot on a terminal status)
 * becomes unrepresentable in one column — the doctor's hot_without_active
 * check retires with it.
 *
 * `kind` reshapes v6 IN PLACE (the version never shipped — the release
 * fires on merge to main, so no store outside this repo has applied the
 * original v6): kind is promoted from a free metadata tag to a required
 * column with a free vocabulary (#31, data-backed — the real v0.1 store
 * carries metadata.kind on 219/219 rows, and dream/vision rule the enum
 * out). The backfill reads the metadata tag, 'unclassified' where absent
 * — the debt is marked, reclassifying it is a supersede (the
 * `summary = null` precedent). The SAME pass then strips `$.kind` from
 * every row's metadata — one source of truth from v6 on, no divergence
 * invariant, no doctor check. ORDER MATTERS: the basket logic reads
 * `metadata.kind`, so it runs BEFORE the strip. The backfill and the
 * strip both read metadata through json_extract/json_remove, so a row
 * whose metadata is not valid JSON (hand-SQL corruption on a v5 store)
 * makes the migration fail — refuse-don't-hide: the store's truth is
 * never silently rewritten past corruption (dev ruling, 2026-10-25).
 */
const V6 = `
ALTER TABLE memories ADD COLUMN summary TEXT;
ALTER TABLE memories ADD COLUMN kind TEXT NOT NULL DEFAULT 'unclassified';
UPDATE memories SET kind = COALESCE(json_extract(metadata, '$.kind'), 'unclassified');
UPDATE memories SET status = 'hot'
 WHERE status = 'active'
   AND json_extract(metadata, '$.kind') IN ('directive', 'summary', 'objective')
   AND (json_extract(metadata, '$.kind') != 'objective'
        OR json_extract(metadata, '$.state') = 'open');
UPDATE memories SET metadata = json_remove(metadata, '$.kind')
 WHERE metadata IS NOT NULL;
ALTER TABLE memories DROP COLUMN weight;
ALTER TABLE memories DROP COLUMN access_count;
`;

const migrations: Readonly<Record<number, string>> = {
  1: V1,
  2: V2,
  3: V3,
  4: V4,
  5: V5,
  6: V6,
};

function ensureVersionTable(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const row = db
    .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    .get() as { version: number } | undefined;
  return row?.version ?? 0;
}

/**
 * The store's applied schema version, read WITHOUT creating anything.
 * `ensureVersionTable` writes (CREATE TABLE IF NOT EXISTS), so read-only
 * opens must not use it; this is the pure read. Returns 0 when the table
 * is absent (a pre-versioning store) or unreadable — the read-only open refuses.
 */
export function schemaVersion(db: DatabaseSync): number {
  try {
    const row = db
      .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

export function migrate(db: DatabaseSync): void {
  const current = ensureVersionTable(db);
  for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
    const migration = migrations[version];
    if (!migration) throw new StoreError('invalid', `No migration for schema version ${version}`);
    db.exec('BEGIN');
    try {
      db.exec(migration);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
