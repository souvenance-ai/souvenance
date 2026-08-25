# 02-supersede-command

Type: task
Status: closed

## Question

Implement the `supersede` CLI command and the underlying `Store.supersede()` method.

### Requirements

**CLI** (`bin/memory.js`):

```
memory supersede <old-id> --content "new content" [--metadata <json>]
```

- `--content` is required (the new memory's content)
- `--metadata` is optional (the new memory's metadata)

**Store method** (`src/db.ts`):

`supersede(oldId: string, content: string, opts?: { metadata?: Record<string, unknown> }): string`

1. Validate `oldId` exists and is currently `active` (cannot supersede an already-superseded/deprecated/merged memory)
2. Store the new memory (gets a fresh UUID, status `active`)
3. Link old → new with `--kind supersedes`
4. Set old memory's status to `superseded`
5. All three steps in one transaction (use `this.run()` wrapper)
6. Return the new memory's id

**Edge cases:**
- Old memory not found → error
- Old memory not active → error: "cannot supersede a memory with status '<status>'"
- Content empty → error (same as store)

### Blocked by

01-schema-migration-status-column
