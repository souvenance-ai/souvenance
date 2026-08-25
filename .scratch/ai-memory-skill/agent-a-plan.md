# Plan: Add a `tags` Command to the Memory CLI

## Overview

Add a `tags` command to the memory CLI that lists all distinct tags across memories, with counts. Tags are arrays stored inside the `metadata` JSON column on the `memories` table (e.g. `{"kind":"finding","tags":["store","methods"]}`). The command aggregates tag frequencies using SQLite's `json_each` table-valued function — no schema change required.

## Memory Graph References

This plan synthesizes the following memories:

- **Plan**: `memory://8aa0c166-c446-48e0-bfac-b789b540a9d5` — original implementation plan
- **Decision (adopted)**: `memory://99f506a2-2296-440f-87b8-ab8606134c41` — use `json_each` for tag aggregation
- **Decision (refined)**: `memory://ed060318-e54c-41fd-a7e0-ba4593cb061d` — add `json_type` guard to the SQL
- **Finding (edge case)**: `memory://369b96ac-a9ca-4cdb-b000-c59ba6e0f61d` — `json_each` on scalars produces spurious rows
- **Finding (schema)**: `memory://931d7e49-5881-479b-befe-1add47d1d11b` — tags live in metadata JSON, no schema change needed
- **Finding (library)**: `memory://51f808a7-59f5-4c8a-bf42-97f26e784639` — Store class architecture and methods
- **Finding (types)**: `memory://0cb0df9b-9ff6-4857-80f1-e9b105448960` — types.ts interface inventory
- **Finding (CLI)**: `memory://cb2b7ef9-01f8-4ae9-ab37-596482b512b1` — CLI switch-based command dispatch
- **Finding (tests)**: `memory://7c7e8f31-9a3b-4cb8-863c-2282cf49351d` — test runner and patterns
- **Decision (rejected alt 1)**: `memory://a2520296-677e-4d4e-ad1a-41ebd8cd1836` — separate tags table
- **Decision (rejected alt 2)**: `memory://7c1e6419-2349-431b-9c93-a9c7a29dcd8b` — CLI-side JS aggregation

## Schema Impact

**None.** No migration is needed. Tags are stored as a JSON array inside the existing `metadata` TEXT column on the `memories` table. The query uses SQLite JSON1 functions (`json_each`, `json_type`) to extract and aggregate tags at query time. `SCHEMA_VERSION` stays at 1.

See: `memory://931d7e49-5881-479b-befe-1add47d1d11b`, `memory://63cc8285-07ee-448a-9ee8-0351424a8058`

## Library Changes

### `src/types.ts`

Add two new types:

```typescript
export interface TagCount {
  tag: string;
  count: number;
}

export interface TagsOptions {
  where?: string;
}
```

`TagCount` represents one row of output: a tag string and how many memories carry it. `TagsOptions` mirrors the pattern of `SearchOptions` and `ListOptions` — an optional `where` SQL fragment for filtering memories by metadata (e.g. `metadata->>'$.kind' = 'finding'`).

See: `memory://0cb0df9b-9ff6-4857-80f1-e9b105448960`

### `src/db.ts`

Add a `tags()` method to the `Store` class:

```typescript
tags(opts: TagsOptions = {}): TagCount[] {
  let sql = `SELECT json_each.value AS tag, count(*) AS count
             FROM memories, json_each(metadata->'$.tags')
             WHERE metadata IS NOT NULL
               AND json_type(metadata->'$.tags') = 'array'`;
  const params: (string | number)[] = [];
  if (opts.where) {
    sql += ` AND ${opts.where}`;
  }
  sql += ` GROUP BY tag ORDER BY count DESC, tag ASC`;
  const rows = this.db.prepare(sql).all(...params) as { tag: string; count: number }[];
  return rows;
}
```

Key design points:
- **`json_each(metadata->'$.tags')`** — table-valued function that unnests the tags JSON array into one row per element.
- **`json_type(metadata->'$.tags') = 'array'`** — guard against non-array tag values. Without this, if `metadata.tags` is a scalar (e.g. the string `"foo"`), `json_each` produces a spurious row. This was discovered via prototyping (see `memory://369b96ac-a9ca-4cdb-b000-c59ba6e0f61d`).
- **`metadata IS NOT NULL`** — skip memories with no metadata at all.
- **`ORDER BY count DESC, tag ASC`** — most frequent tags first, alphabetical tiebreak.
- **`--where` filter** — ANDed after the json_type guard, matching the pattern used by `search()` and `list()`.
- No `limit` option — tag counts are aggregated by SQLite and the result set is bounded by the number of distinct tags, which is naturally small.

Import `TagCount` and `TagsOptions` from `./types.ts` at the top of the file.

See: `memory://51f808a7-59f5-4c8a-bf42-97f26e784639`, `memory://99f506a2-2296-440f-87b8-ab8606134c41`, `memory://ed060318-e54c-41fd-a7e0-ba4593cb061d`

## CLI Changes

### `bin/memory.js`

1. **Add `tags` to the HELP text** — insert after the `stats` line:
   ```
   tags [--where <sql>]                       List all distinct tags with counts, as JSON
   ```

2. **Add `tags` case to the switch statement** (after the `stats` case):
   ```javascript
   case "tags": {
     const results = store.tags({
       ...(flags["--where"] ? { where: flags["--where"] } : {}),
     });
     print(results);
     break;
   }
   ```

3. **Update `README.md`** — add a row to the CLI commands table:
   ```
   | `tags [--where <sql>]` | List all distinct metadata tags with counts |
   ```

See: `memory://cb2b7ef9-01f8-4ae9-ab37-596482b512b1`

## Test Strategy

### New file: `src/tags.test.ts`

Following the existing test patterns (see `memory://7c7e8f31-9a3b-4cb8-863c-2282cf49351d`): use `node:test`, `node:assert/strict`, and the `tempStore()` helper.

Tests to write:

1. **Empty store returns `[]`** — `store.tags()` on a fresh store returns an empty array.
2. **Tags with counts** — store 3 memories with overlapping tags; assert the counts match.
3. **Ordering: count DESC, tag ASC** — store memories with tags that produce ties; assert alphabetical tiebreak.
4. **Memories without tags are excluded** — store a memory with `metadata: {kind: "note"}` (no `tags` key); assert it does not contribute to results.
5. **Memories with null metadata are excluded** — store a memory with no metadata; assert no error and no contribution.
6. **Non-array tags are excluded** — store a memory with `metadata: {tags: "not-an-array"}`; assert it is silently skipped (the `json_type` guard).
7. **`--where` filter works** — store memories with different `kind` values; filter by `metadata->>'$.kind' = 'finding'` and assert only tags from matching memories are counted.
8. **Tags aggregate across memories correctly** — store 3 memories all with tag `"animal"`; assert count is 3.
9. **Duplicate tags in one memory count once per memory** — store a memory with `tags: ["a", "a"]`; assert count is 1 (json_each produces 2 rows for the same memory, but the `count(*)` counts rows, not distinct memories — this is a known behavior to document; alternatively use `count(DISTINCT id)` if per-memory counting is desired).

   > **Design note**: The query counts per-memory-tag pairs, not distinct memories. If a memory has `["a", "a"]`, `json_each` yields 2 rows, so count = 2. If we want per-memory counting, use `count(DISTINCT m.id)`. The simplest approach is to accept that tags arrays should not contain duplicates (a data-quality concern, not a query concern). The test should document this behavior explicitly.

### Add to `src/integration.test.ts`

Add a CLI smoke test for the `tags` command within the existing CLI integration test block:

```typescript
// tags command — should return tag counts
const tagsResult = JSON.parse(run("tags"));
assert.ok(Array.isArray(tagsResult));
// ... assert specific tag counts based on seeded data
```

## Design Alternatives Considered and Rejected

### Alternative 1: Separate `memory_tags` table

**Idea**: Add a `memory_tags (memory_id TEXT, tag TEXT)` table with a trigger that keeps it in sync when `memories.metadata` is inserted or updated. Tag queries become `SELECT tag, count(*) FROM memory_tags GROUP BY tag`.

**Rejected because**:
1. **Schema migration required** — new table, new triggers, new `SCHEMA_VERSION` bump. The existing system prides itself on zero-migration simplicity (migrate-on-open, currently V1).
2. **Data duplication** — tags would exist in both the `metadata` JSON column and the `memory_tags` table. The CONTEXT.md glossary explicitly states: "A JSON object attached to a memory holding agent-defined attributes (tags, kind, source, etc.). Attributes live here, not as graph edges." Duplicating them into a table violates this principle.
3. **Sync problem** — if metadata is updated via raw SQL or an external tool, the tags table becomes stale. The trigger approach only works for SQL-level changes that go through the trigger path.
4. **Unnecessary complexity** — `json_each` on the JSON column handles the query volume expected (hundreds to low thousands of memories). A normalized table is premature optimization.

See: `memory://a2520296-677e-4d4e-ad1a-41ebd8cd1836`

### Alternative 2: CLI-side JavaScript aggregation

**Idea**: Do not add a `tags()` method to `Store`. Instead, in `bin/memory.js`, call `store.list({ limit: 100000 })` to load all memories, then iterate in JavaScript to extract and count tags.

**Rejected because**:
1. **Does not scale** — loads every memory's content and metadata into the Node.js process just to count tags. For large stores, this is memory-intensive and slow.
2. **Bypasses the library layer** — the `Store` class is the data-access boundary. Putting aggregation logic in the CLI couples the CLI to the internal structure of metadata.
3. **Duplicated effort** — SQLite can do the aggregation natively and efficiently via `json_each` + `GROUP BY`. Reimplementing it in JavaScript is strictly worse.
4. **Pagination problem** — `list()` defaults to limit 20. To get all memories, the CLI would need either a very high limit (fragile) or a pagination loop (complex and slow).
5. **Breaks the pattern** — every other command (`stats`, `search`, `list`) delegates the query to a `Store` method. The CLI is a thin dispatcher, not a data-processing layer.

See: `memory://7c1e6419-2349-431b-9c93-a9c7a29dcd8b`

## Implementation Order

1. Add `TagCount` and `TagsOptions` to `src/types.ts`
2. Add `tags()` method to `Store` in `src/db.ts` (import new types)
3. Add `tags` case to `bin/memory.js` switch + update HELP text
4. Create `src/tags.test.ts` with the tests listed above
5. Add CLI smoke test to `src/integration.test.ts`
6. Update `README.md` CLI commands table
7. Run `yarn typecheck` and `yarn test` to verify

## Expected Output Example

```bash
$ node bin/memory.js tags --db .ai-memory/test-eval.db
[
  { "tag": "store", "count": 2 },
  { "tag": "tags-command", "count": 2 },
  { "tag": "json_each", "count": 2 },
  { "tag": "rejected", "count": 2 },
  { "tag": "plan", "count": 1 },
  { "tag": "types", "count": 1 },
  ...
]
```

With a `--where` filter:

```bash
$ node bin/memory.js tags --where "metadata->>'\$.kind' = 'decision'" --db .ai-memory/test-eval.db
[
  { "tag": "json_each", "count": 1 },
  { "tag": "tags-command", "count": 1 },
  { "tag": "sql", "count": 1 },
  { "tag": "no-schema-change", "count": 1 },
  ...
]
```
