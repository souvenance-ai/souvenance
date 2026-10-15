# 01-library-resolution

Type: task
Status: resolved

## Question

Implement relation resolution in the library so that graph traversal can hop the supersedes/merges bridges without touching data.

### Requirements

**Types** (`src/types.ts`):

- `Relation` gains an optional `resolved_to?: UUID` field — present only when resolution was requested AND the relation's target has a resolvable successor chain.
- `RelationsOptions` gains `resolve?: boolean` (default absent/false).

**Store** (`src/db.ts`):

- `relations(id, opts)` unchanged when `opts.resolve` is falsy — raw rows, byte-identical behavior to today.
- When `resolve: true`, for each returned relation: if the `to_id` memory is `superseded` or `merged`, follow the unique outgoing `supersedes`/`merges` bridge until a memory with status `active`; annotate the relation with `resolved_to: <that id>` and leave the raw fields untouched.
  - Uniqueness is by construction: `supersede`/`merge` require an active source and each creates exactly one bridge relation old→new, so chains are linear.
  - No successor (missing id, `deprecated` target, or a defensively-broken chain) → no annotation; the edge stays bare.
  - Active targets → no annotation (`resolved_to` would be redundant).
  - The `from_id` side is never resolved: relations point forward.

**Tests** (`src/reads.test.ts`, appended to the relations block):

1. Active target stays raw (`resolve: true`, no annotation).
2. Default (no flag) output is untouched — no `resolved_to` anywhere.
3. `active→superseded` target with a supersedes bridge → `resolved_to` = current version.
4. Depth-2 chain (superseded twice) → resolves to the terminal.
5. `merged` target → `resolved_to` = merged memory.
6. `deprecated` target → no annotation.
7. Orphaned `superseded` memory (bridge removed at store level) → no annotation, no throw.
8. `from_id` superseded → never rewritten.

### Answer

Implemented exactly as specced (2026-10-15).

- `src/types.ts`: `Relation.resolved_to?: UUID`; `RelationsOptions.resolve?: boolean` with a doc comment carrying the semantics.
- `src/db.ts`: `relations()` annotates only when `opts.resolve`; annotation fires when `resolveChain(to_id)` finds a terminal active memory that differs from the raw `to_id`. `private resolveChain(id)` follows the unique `supersedes`/`merges` bridge (ORDER BY created_at DESC LIMIT 1) until `active`; returns undefined for missing ids, `deprecated` targets, bridge-less superseded nodes (hand-edited stores), or a defensively-broken loop. JSDoc states the linearity argument (supersede/merge require an active source, one bridge each).
- Tests appended to the relations block in `src/reads.test.ts` (8 new, all names in the requirements list): 162/162 pass, `tsc` clean.

Verification detail: the "orphaned superseded" test mutates status via `store.db` directly to simulate a hand-edited store (FK keeps real stores from producing dangling/bridge-less links on their own). The depth-2 test proves `supersede` of an already-superseded+zsuper path resolves to the newest id, not the first hop.
