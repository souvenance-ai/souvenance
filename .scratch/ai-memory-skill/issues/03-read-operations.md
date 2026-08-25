# Read operations

Type: task
Status: resolved
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

## Answer

Done. Commit `feat: implement read operations (search, get, list, relations, stats)`.

**What was built:**

All five read operations added as methods on `Store` in `src/db.ts`:

- **`search(query, opts?)`**: FTS5 `MATCH` over `memories_fts`, joined back to `memories`. Returns `SearchResult[]` ranked by `bm25(memories_fts)` (lower = better match). Optional `where` appends a raw SQL filter on metadata (e.g. `metadata->>'$.kind' = 'note'`). Default `limit` 20. Throws on empty query. Deserializes metadata JSON; null metadata stays null.

- **`get(id)`**: fetches one memory by id. Returns `Memory | null` — **null for unknown id** (documented; chosen over throwing because `get` is the `memory://<id>` resolver and "not found" is a normal case for link traversal, not an error). Deserializes metadata.

- **`list(opts?)`**: lists memories ordered by `created_at DESC`, paginated via `limit` (default 20) and `offset` (default 0). Optional `where` for metadata filter (same raw-SQL convention as `search`). Returns `Memory[]`; empty array when no memories.

- **`relations(id, opts?)`**: lists edges to/from a memory. `direction` is `out` / `in` / `both` (default). Returns `Relation[]` (includes `from_id`, `to_id`, `kind`, `metadata`, `created_at`). Throws `memory not found: <id>` on unknown id. Empty array when no edges.

- **`stats()`**: returns `{ memories, edges, edges_by_kind }` where `edges_by_kind` is a `Record<string, number>` breakdown by edge kind, ordered by kind. No params.

**Design decisions:**

- `get` returns `null` (not throw) for unknown id: it's the `memory://` link resolver, and missing memories are a normal traversal outcome, not an error. Contrast with `relations`, which throws — `relations` is called with intent to traverse _from_ a known memory; if it doesn't exist that's a caller error.
- `where` filters are raw SQL fragments appended to the query (e.g. `metadata->>'$.tags' = 'animal'`). This is the simplest contract for v1; a structured query builder is a later layer if needed. The CLI (ticket 04) will need to document this format.
- Row mapping uses typed interfaces (`MemoryRow`, `SearchRow`, `RelationRow`) cast through `unknown` (node:sqlite returns `Record<string, SQLOutputValue>`), with parse helpers that deserialize `metadata` JSON. Follows the existing `{ c: number }` pattern from scaffold code.

**Verification:**

- `yarn typecheck`: clean (0 errors).
- `yarn test`: 51/51 pass (25 existing + 26 new). New tests cover: search (7 — ranking, limit, default limit, metadata filter, empty query, JSON/null metadata), get (3 — found, null on unknown, null metadata), list (6 — order, pagination, default limit, metadata filter, JSON deserialization, empty), relations (6 — both/out/in directions, metadata inclusion, unknown-id error, empty), stats (3 — counts+breakdown, fresh store, post-deletion counts).

**Facts later tickets depend on:**

- Read methods are on `Store`: `store.search()`, `store.get()`, `store.list()`, `store.relations()`, `store.stats()`.
- `search` returns `SearchResult[]` (has `rank`); `get` returns `Memory | null`; `list` returns `Memory[]`; `relations` returns `Relation[]`; `stats` returns `Stats`.
- `get` returns `null` for unknown id — CLI `get` command should print `null` or "not found" to stderr + non-zero, not throw.
- `where` filters are raw SQL fragments on the `metadata` JSON column using SQLite JSON operators (`->>`, `->`). CLI `--where` flag passes these through directly.
- Default `limit` is 20 for both `search` and `list`; `list` also supports `offset` for pagination.
