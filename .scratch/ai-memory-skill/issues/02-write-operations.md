# Write operations

Type: task
Status: claimed
Blocked by: 01

## Question

Implement the write operations in the library: `store`, `update`, `delete`, `link`.

**Scope:**

1. **`store(content, metadata?)`**: insert a new memory. Generate a UUID v4 id. Validate `content` is non-empty (throw on empty). Serialize `metadata` to JSON if provided. Set `created_at` to now (ISO 8601). Return the new `id`.

2. **`update(id, { content?, metadata? })`**: edit an existing memory. At least one of `content`/`metadata` must be provided. Reject unknown `id` with a clear error. FTS5 trigger keeps the index in sync.

3. **`delete(id)`**: remove a memory. FK cascade removes its edges. Reject unknown `id` with a clear error. FTS5 trigger removes it from the index.

4. **`link(fromId, toId, kind, metadata?)`**: create a directed, typed edge. Validate both ids exist (reject with clear error). Set `created_at`. Duplicate (same from/to/kind) is an error or upsert — pick one and document. `metadata` serialized to JSON if provided.

**Acceptance**: each operation validates inputs, returns a clear result or throws on error, and the FTS index stays consistent after writes. Smoke-test each operation.
