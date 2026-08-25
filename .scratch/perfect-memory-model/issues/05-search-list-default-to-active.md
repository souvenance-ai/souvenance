# 05-search-list-default-to-active

Type: task
Status: open

## Question

Make `search` and `list` exclude non-active memories by default, and add a `--all` flag to include them.

### Requirements

**CLI** (`bin/memory.js`):

- Add `--all` flag to `search` and `list` commands
- When `--all` is absent, filter `status = 'active'` by default
- When `--all` is present, no status filter is applied
- When the user provides `--where`, the `status = 'active'` default is ANDed with their condition (unless `--all`)

**Store methods** (`src/db.ts`):

- `search()`: if no `--all` equivalent in options, add `AND status = 'active'` to the SQL WHERE clause (before `--where` and before ORDER BY/LIMIT)
- `list()`: same — add `WHERE status = 'active'` or `AND status = 'active'`
- Add `includeLegacy?: boolean` to `SearchOptions` and `ListOptions` in `src/types.ts`
- `tags()`: should also default to active only (add `--all` flag; add `includeLegacy` to `TagsOptions`)
- `stats()`: add `active_memories` count alongside `memories` total, and `memories_by_status` breakdown

**Edge cases:**
- `--all` + `--where "metadata->>'$.kind' = 'bug'"` → no status filter, only metadata filter
- `--where "status = 'deprecated'"` without `--all` → should this work? Decision: `--where` is ANDed with the default active filter, so this would return nothing. The user must use `--all` to see non-active memories. This is intentional — `--all` is the explicit opt-in.

### Blocked by

01-schema-migration-status-column
