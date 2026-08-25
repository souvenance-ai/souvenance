# Scaffold and schema

Type: task
Status: resolved

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

## Answer

Done. Commit `4d2b1c3` (`feat: scaffold project and SQLite schema with migrate-on-open`).

**What was built:**

- **Project scaffold** (`package.json`): `type: module`, `packageManager: yarn@4.18.0`, `engines.node >=22`, `bin.memory → bin/memory.js`, scripts `typecheck` (`tsc --noEmit`) and `test` (`node --experimental-strip-types --test`). Dev deps: `typescript@5.8.3`, `@types/node@24.0.0`. `tsconfig.json` targets `ESNext`/`NodeNext`, strict, `noEmit` (Node 24 strips types at runtime via `--experimental-strip-types`; no separate build step).

- **DB connection module** (`src/db.ts`): `Store.open({ dbPath? })` resolves the path (default `.ai-memory/memory.db`), `mkdirSync`s the parent, opens via `new DatabaseSync`, sets `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=5000`, then runs migrations. `Store.run(fn)` wraps writes with busy-retry (errcode 5 / `SQLITE_BUSY`, 50 retries, 20ms backoff via `Atomics.wait`).

- **Schema v1** (`src/migrations.ts`): `memories` (id TEXT PK, content TEXT NOT NULL, metadata TEXT, created_at TEXT), `edges` (from_id, to_id, kind, metadata, created_at; composite PK (from_id, to_id, kind); FKs to memories with `ON DELETE CASCADE`; indexes on from_id and to_id), `schema_version` (version INTEGER PK, applied_at TEXT), `memories_fts` (FTS5 virtual table, `content='memories'`, `content_rowid='rowid'`), and three triggers (`memories_ai`/`_ad`/`_au`) keeping FTS in sync on insert/delete/update.

- **Migration runner** (`migrate()`): ensures `schema_version` table, reads the current version, runs each pending migration inside a `BEGIN`/`COMMIT` transaction with `ROLLBACK` on error, recording the version and timestamp. `SCHEMA_VERSION = 1`.

- **Types** (`src/types.ts`): shared interfaces (`Memory`, `Relation`, `StoreOptions`, `UpdateOptions`, `SearchOptions`, `ListOptions`, `Direction`, `RelationsOptions`, `Stats`, `SearchResult`) for later tickets.

**Verification:**

- `yarn typecheck`: clean (0 errors).
- `yarn test`: 5/5 pass — tables created on fresh open; reopen is a no-op (version unchanged); WAL + FK pragmas set; FTS5 in sync across insert/update/delete; FK cascade removes edges on memory delete.

**Facts later tickets depend on:**

- Runtime: Node 24 with `--experimental-strip-types`. Run tests with `yarn test`; the CLI and any `.ts` imports need the flag (or a future `--import` hook). `bin/memory.js` (ticket 04) should be plain JS or a JS stub that spawns `node --experimental-strip-types` on the TS entry.
- The `Store` class (`src/db.ts`) is the library entry point later tickets build on: `Store.open()` returns a `Store` with a `.db: DatabaseSync` and a `.run(fn)` busy-retry wrapper for writes.
- `node:sqlite` `DatabaseSync.prepare().run()` binds positional `?` params; rows come back as `[Object: null prototype]`. FTS5 `bm25()` is available for ranking (ticket 03).
- `memories_fts` is an external-content FTS5 table keyed by `memories.rowid`; search joins `memories_fts f JOIN memories m ON m.rowid = f.rowid`.
