# 03-deprecate-command

Type: task
Status: open

## Question

Implement the `deprecate` CLI command and the underlying `Store.deprecate()` method.

### Requirements

**CLI** (`bin/memory.js`):

```
memory deprecate <id>
```

No flags needed (no replacement content — this is soft deletion).

**Store method** (`src/db.ts`):

`deprecate(id: string): void`

1. Validate `id` exists
2. Validate `id` is currently `active` (cannot deprecate an already-superseded/deprecated/merged memory)
3. Set status to `deprecated`
4. Wrap in `this.run()`

**Edge cases:**
- Memory not found → error
- Memory not active → error: "cannot deprecate a memory with status '<status>'"

### Blocked by

01-schema-migration-status-column
