# Read operations

Type: task
Status: open
Blocked by: 01

## Question

Implement the read operations in the library: `search`, `get`, `list`, `relations`, `stats`.

**Scope:**

1. **`search(query, { where?, limit? })`**: FTS5 `MATCH` over `memories_fts.content`, joined back to `memories` for metadata. Returns ranked results (FTS5 `bm25` ranking). Optional `where` filters on metadata JSON path (e.g. `metadata->>'$.tags' = ?`). Default `limit` 20.

2. **`get(id)`**: fetch one memory by id. Return `null` or throw on unknown id (pick one and document). This is how `memory://<id>` links are resolved.

3. **`list({ where?, limit?, offset? })`**: list memories by metadata filter only (no text match). Paginated via `limit`/`offset`. Default `limit` 20. Ordered by `created_at DESC`.

4. **`relations(id, { direction? })`**: list edges to/from a memory. `direction` is `out` (edges from this memory), `in` (edges to this memory), or `both` (default). Returns the edge rows (including `kind`, `metadata`, and the id at the other end). Reject unknown `id`.

5. **`stats()`**: return counts: total memories, total edges, optionally a breakdown of edge `kind` counts. No parameters. For orientation.

**Acceptance**: each operation returns correctly shaped results, applies filters and limits, and handles unknown ids per the documented contract. Smoke-test each with seed data inserted directly via SQL (this ticket does not depend on the write-operations ticket).
