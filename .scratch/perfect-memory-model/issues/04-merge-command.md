# 04-merge-command

Type: task
Status: open

## Question

Implement the `merge` CLI command and the underlying `Store.merge()` method.

### Requirements

**CLI** (`bin/memory.js`):

```
memory merge <id1> <id2> [<id3> ...] --content "merged content" [--metadata <json>]
```

- At least 2 ids required
- `--content` is required (the merged memory's content)
- `--metadata` is optional

**Store method** (`src/db.ts`):

`merge(ids: string[], content: string, opts?: { metadata?: Record<string, unknown> }): string`

1. Validate all ids exist and are `active`
2. Store the new merged memory (fresh UUID, status `active`)
3. For each original id: link original → merged with `--kind merges`
4. Set each original's status to `merged`
5. All steps in one transaction
6. Return the merged memory's id

**Edge cases:**
- Fewer than 2 ids → error
- Any id not found → error
- Any id not active → error: "cannot merge a memory with status '<status>'"
- Duplicate ids → error
- Content empty → error

### Blocked by

01-schema-migration-status-column
