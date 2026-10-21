# 01 — one-gesture writing: `--relation <kind>:<uuid>` on store/supersede

Type: task
Status: resolved
Spec: see `../spec.md`, leg 1

- Lib: `StoreOptions.relations` on `store` + `supersede`; the outgoing
  edges created in the same call; per-edge validation identical to
  `link` (memory not found / empty kind) — shared body, no duplicate SQL.
- CLI: `--relation <kind>:<uuid>` repeatable, full uuids only, on the two
  verbs; help lines + the Notes block (syntax, direction = outgoing,
  supersede applies to the NEW memory).
- Parity: MCP inputSchema `relations` (array of {to, kind}) on the two
  tools; HTTP bodies `relations: [{to, kind}]` on POST /memories +
  POST /memories/:id/supersede.
- The `link` verb unchanged and still documented beside it.
- Tests: lib (edges land atomically, invalid to/kind refuse, self-edge
  lands and doctor flags it), CLI contract (spawnSync), MCP round trip,
  HTTP bodies (201 + the relations readable via GET relations).

## Resolution

(agent-side — lands in the arc's single bump PR)

Shipped in the arc's single PR (bump 0.1.4):

- Lib: `RelationSpec {to, kind}` on `StoreOptions.relations`; `store` now
  runs in an explicit BEGIN/COMMIT like supersede and its edges go through
  the private `insertRelations` helper — the link INSERT statement
  verbatim (no duplicate SQL), per-edge validation identical to link
  (kind non-empty, target exists → `memory not found`), self-edges left
  to the doctor (by construction they cannot occur through the
  one-gesture path: the target must pre-exist and the new id is generated
  inside the call; the only self-edge path is `link`, covered by the
  doctor's self_edges test). `supersede` inserts the relations for the
  NEW memory after the supersedes bridge; a bad target rolls the whole
  revision back (verified: the old memory stays active, unbridged).
- CLI: `--relation <kind>:<uuid>`, repeatable (parser extended alongside
  --store/--token/--token-file); full uuids ONLY — a truncated id is
  refused AT THE FLAG (`is not a full uuid`), a colon-less value names the
  expected shape; wired on both verbs; help + Notes block updated.
- MCP: `relations` array on store/supersede schemas; shape validated in
  `optRelations` (tool-level errors, not protocol errors); the merge and
  link tools were left untouched — merge builds opts with the shared
  `storeOptions`, so relations parsing lives in the two run bodies.
- HTTP: `relations: [{to, kind}]` on POST /memories +
  POST /memories/:id/supersede, parsed in `checkRelations` SEPARATELY
  from the shared `storeOptions` helper (merge has no relations
  semantics; an accepted-but-ignored field would be a silent no-op).
  Refusals: shape/kind → 400 (shared helper), missing target → 404
  (lib's precise error through statusFor).
- Tests: lib atomicity (invalid to/kind → nothing lands), one-gesture
  edges land, supersede relations + rollback, CLI spawnSync contract
  (store, supersede, 3 refusal paths), MCP round trip + shape errors,
  HTTP 201/400/404. Suite 316+ green, typecheck clean.
