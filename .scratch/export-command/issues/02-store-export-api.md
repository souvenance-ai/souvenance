# 02-store-export-api

Type: grilling
Status: resolved

## Question

Should the export command use new Store methods or direct SQL via the exposed `store.db`?

Context: The `Store` class is the deep module (see AGENTS.md). `store.db` is `readonly db: DatabaseSync` — accessible but bypassing the class's encapsulation. Current limitations:

- `list()` has a default `limit: 20` and needs pagination for full export.
- `relations(id)` is per-memory and throws on unknown id.
- There is no method to list all edges globally.

Options:

1. **New Store methods** (e.g. `allMemories()`, `allEdges()`): stays in the deep-module pattern, testable, reusable. Adds API surface but keeps SQL inside the class.
2. **Direct SQL via `store.db`**: no new methods, but the CLI reaches into the class internals. Faster to implement, but breaks encapsulation and is harder to test in isolation.
3. **Paginate existing methods**: use `list({ limit: N, offset: 0..∞, includeLegacy: true })` in a loop + `relations(id)` per memory. No new API, but O(n) queries for edges and awkward.

The decision affects testability, the deep-module contract, and whether other commands could benefit from bulk retrieval later. What's the right trade-off for a humans-only command?

## Answer

One `dump()` method on Store. Returns `{ memories: IterableIterator<Memory>, edges: IterableIterator<Relation> }` — lazily-yielding generators (via `StatementSync.get()` one row at a time), not full arrays, so a 10k-memory store doesn't materialize 10k objects at once.

### Rationale

- **One method, not two**: reduces API surface. The name `dump` signals "bulk read, use sparingly" without leaking export/format concerns into Store.
- **Lazy iterators, not arrays**: export streams memories one at a time (write file, move on). Only edges need materialization (small, no content) into a `Map<id, Relation[]>` for the rendering pass.
- **Not export-specific**: `dump()` yields raw `Memory` and `Relation` objects; it has no knowledge of markdown, frontmatter, or file writing. That stays in the CLI.
- **JSDoc'd as not stable API**: `/** Bulk read for export/dump operations; not part of the stable API. */` — soft convention since `private` is inaccessible to `bin/memory.js` (the CLI lives outside the class).

### Signature

```ts
dump(): { memories: IterableIterator<Memory>; edges: IterableIterator<Relation> }
```

- No flags (export is defined as full-history, so no filtering needed).
- Uses existing `parseMemoryRow` / `parseRelationRow` parsers.
- `allEdges` query is a single `SELECT ... FROM edges ORDER BY created_at`.

### Rejected

- **Two public methods (`allMemories()` + `allEdges()`)**: doubles API surface for one command's use.
- **`export()` on Store**: leaks output-format knowledge (markdown, frontmatter) into the data layer.
- **Direct SQL via `store.db`**: breaks the deep-module contract the codebase follows.
- **Paginate existing `list()` + `relations()`**: O(n) edge queries (500 memories = 500 calls), awkward pagination loop.
