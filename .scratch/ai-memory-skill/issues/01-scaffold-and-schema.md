# Scaffold and schema

Type: task
Status: open

## Question

Scaffold the project and implement the SQLite schema with migrate-on-open.

**Scope:**

1. **Project scaffold**: `package.json` (packageManager yarn, type module), source layout (`src/` for the library, `bin/` for the CLI entry). Confirm `node:sqlite` is available on the target Node version (22+).

2. **DB connection module** (`src/db.ts` or similar): opens `.ai-memory/memory.db` (creating the directory if needed), sets `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`. Implements busy-retry on `SQLITE_BUSY` for writes.

3. **Schema (v1)**, created on first open and recorded in a `schema_version` table:
   - `memories`: `id TEXT PRIMARY KEY` (UUID v4), `content TEXT NOT NULL`, `metadata TEXT` (JSON, nullable), `created_at TEXT NOT NULL` (ISO 8601).
   - `edges`: `from_id TEXT`, `to_id TEXT`, `kind TEXT NOT NULL`, `metadata TEXT` (JSON, nullable), `created_at TEXT NOT NULL`, `PRIMARY KEY (from_id, to_id, kind)`, `FOREIGN KEY (from_id) REFERENCES memories(id) ON DELETE CASCADE`, `FOREIGN KEY (to_id) REFERENCES memories(id) ON DELETE CASCADE`.
   - `schema_version`: `version INTEGER PRIMARY KEY`, `applied_at TEXT NOT NULL`.

4. **FTS5 virtual table** `memories_fts` over `content`, with sync triggers (insert/update/delete on `memories` keeps FTS in sync). This is schema setup; the search _query_ lives in the read-ops ticket.

5. **Migration runner**: on open, read `schema_version`, run pending migrations, update the version. v1 migration creates all the above.

**Acceptance**: opening the DB on a fresh project creates all tables; reopening is a no-op; WAL and FK pragmas are set; FTS5 triggers keep the index in sync when rows change. Include a basic smoke test that opens, inserts a row, and confirms FTS finds it.
