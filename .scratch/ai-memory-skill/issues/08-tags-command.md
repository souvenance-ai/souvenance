# `tags` command implementation

Type: task
Status: open
Blocked by: 07

## Question

Implement the `tags` CLI command per the plan at `.scratch/ai-memory-skill/agent-a-plan.md`.

The `tags` command lists all distinct metadata tags across memories, with counts. Tags are arrays stored inside the `metadata` JSON column (e.g. `{"kind":"finding","tags":["store","methods"]}`). The command aggregates tag frequencies using SQLite's `json_each` table-valued function — no schema change required.

**Scope** (from the plan):

1. **`src/types.ts`**: Add `TagCount` interface (`{tag: string, count: number}`) and `TagsOptions` interface (`{where?: string}`).

2. **`src/db.ts`**: Add `tags()` method to `Store`:
   ```sql
   SELECT json_each.value AS tag, count(*) AS count
   FROM memories, json_each(metadata->'$.tags')
   WHERE metadata IS NOT NULL
     AND json_type(metadata->'$.tags') = 'array'
   [AND <where>]
   GROUP BY tag ORDER BY count DESC, tag ASC
   ```
   The `json_type` guard prevents spurious rows from non-array tag values (discovered via prototyping in the evaluation).

3. **`bin/memory.js`**: Add `tags` case to the switch + update HELP text. `memory tags [--where <sql>]` prints JSON array.

4. **`src/tags.test.ts`**: New test file covering: empty store returns `[]`, tags with counts, ordering (count DESC, tag ASC), memories without tags excluded, null metadata excluded, non-array tags excluded (json_type guard), `--where` filter, aggregation across memories, duplicate tags in one memory.

5. **`src/integration.test.ts`**: Add CLI smoke test for `tags` command.

6. **`README.md`**: Add `tags` row to CLI commands table.

**Acceptance**: `yarn typecheck` clean, `yarn test` all green, `node bin/memory.js tags --db <temp>` returns tag counts as JSON, `--where` filter works.
