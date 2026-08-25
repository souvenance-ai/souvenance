# 01-schema-migration-status-column

Type: task
Status: closed

## Question

Add a `status` column to the `memories` table and write the V2 migration.

### Requirements

- Add `status TEXT NOT NULL DEFAULT 'active'` column to `memories` table
- Write migration V2 in `src/migrations.ts` (`ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`)
- Bump `SCHEMA_VERSION` to 2
- Add `status` to the `Memory` and `SearchResult` types in `src/types.ts`
- Update `MemoryRow` and `SearchRow` interfaces in `src/db.ts`
- Update `parseMemoryRow` and `parseSearchRow` to include `status`
- The FTS5 `memories_ai` trigger does not need changes (status is not indexed)
- Existing memories get `'active'` by default (the column default handles this)

### Blocked by

(none)
