# Write operations

Type: task
Status: resolved
Blocked by: 01

## Question

Implement the write operations in the library: `store`, `update`, `delete`, `link`.

**Scope:**

1. **`store(content, metadata?)`**: insert a new memory. Generate a UUID v4 id. Validate `content` is non-empty (throw on empty). Serialize `metadata` to JSON if provided. Set `created_at` to now (ISO 8601). Return the new `id`.

2. **`update(id, { content?, metadata? })`**: edit an existing memory. At least one of `content`/`metadata` must be provided. Reject unknown `id` with a clear error. FTS5 trigger keeps the index in sync.

3. **`delete(id)`**: remove a memory. FK cascade removes its edges. Reject unknown `id` with a clear error. FTS5 trigger removes it from the index.

4. **`link(fromId, toId, kind, metadata?)`**: create a directed, typed edge. Validate both ids exist (reject with clear error). Set `created_at`. Duplicate (same from/to/kind) is an error or upsert — pick one and document. `metadata` serialized to JSON if provided.

**Acceptance**: each operation validates inputs, returns a clear result or throws on error, and the FTS index stays consistent after writes. Smoke-test each operation.

## Answer

Done. Commit ` feat: implement write operations (store, update, delete, link)`.

**What was built:**

All four write operations added as methods on `Store` in `src/db.ts`:

- **`store(content, opts?)`**: generates a UUID v4 id (`node:crypto.randomUUID()`), validates non-empty content, serializes `metadata` to JSON if provided, sets `created_at` to ISO 8601 now. Returns the new `id`. Routed through `store.run()` for busy-retry.

- **`update(id, { content?, metadata? })`**: throws if neither field is provided. Validates id exists (`memory not found: <id>`). Validates non-empty content if provided. Builds a dynamic `SET` clause for only the provided fields. FTS5 trigger keeps index in sync automatically.

- **`delete(id)`**: validates id exists. FK cascade removes edges automatically. FTS5 trigger removes the index entry automatically.

- **`link(fromId, toId, kind, opts?)`**: validates `kind` non-empty, validates both `fromId` and `toId` exist. Duplicate (same from/to/kind) is **idempotent** via `INSERT OR IGNORE` — re-linking the same pair with the same kind is a no-op, not an error. Different kinds between the same pair are allowed. Metadata serialized to JSON if provided.

**Design decisions:**
- Duplicate edges: `INSERT OR IGNORE` (idempotent). The ticket left this open; idempotent is friendlier for agents that may re-assert relations. The existing edge is not overwritten — metadata on the first link wins.
- Methods live on `Store` directly (not a separate module): `Store` is the library's deep-module entry point; keeping write ops on it preserves the single-entry-point contract.

**Verification:**
- `yarn typecheck`: clean (0 errors).
- `yarn test`: 25/25 pass (5 existing + 20 new). New tests cover: store (4), update (5), delete (4), link (7) — including FTS sync, FK cascade, idempotent duplicates, unknown-id errors, empty-content/empty-kind validation, and metadata JSON round-trip.

**Facts later tickets depend on:**
- Write methods are on `Store`: `store.store()`, `store.update()`, `store.delete()`, `store.link()`.
- `store()` returns the UUID id string; `update`/`delete`/`link` return void.
- All writes route through `store.run()` (busy-retry); existence checks do not (reads don't need retry).
- `link` is idempotent: `INSERT OR IGNORE` on the composite PK `(from_id, to_id, kind)`. Re-linking with the same kind is a silent no-op; metadata is NOT updated on re-link.
- Unknown-id errors throw `Error("memory not found: <id>")`; empty content/kind throws `Error("content must be non-empty" / "kind must be non-empty")`. CLI ticket (04) should surface these to stderr + non-zero exit.
