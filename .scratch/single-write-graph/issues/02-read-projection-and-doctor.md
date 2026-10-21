# 02 — read-side projection: `relations` on get, summary edges on recover, broken_links removed, guidance updated

Type: task
Status: resolved
Spec: see `../spec.md`, leg 2

- `get` JSON gains `relations: {out: [...], in: [...]}` (kind-labeled rows,
  raw — resolution stays opt-in via `relations --resolved`). Both
  directions, one extra indexed query.
- `recover` (the CLI verb, the HTTP GET /recover bundle, and the MCP tool
  return) enriches each summary with its direct edges. Summaries only.
- Doctor: `broken_links` removed from DoctorCheck (types.ts) + the check
  loop + its tests. The doctor's enumerated helper strings in bin help and
  README/SKILL updated — a version-visible change, documented, not silent.
- SKILL.md: writing guidance favors `--relation`; "Memory links" becomes
  the legacy-layer note; finish checklist unchanged (edges).
- README: --relation, get shape, /recover shape, doctor checks, command
  table.

## Resolution

(agent-side — lands in the arc's single bump PR with ticket 01)

One SPEC DIVERGENCE, one DECISION made during the arc:

- Divergence: this ticket said "recover (the CLI verb, the HTTP GET
  /recover bundle, and the MCP tool return)" — but no CLI recover verb
  existed; the CLI ritual was the manual three-list composition. Asked,
  Valentin chose PARITY: `souvenance recover` was added (Valentin's call,
  2026-10-21) — the composed ritual is a verb on every surface now, with
  `--directives/--summaries/--objectives` limit flags.
- The composition MOVED INTO THE LIB: `Store.recover(opts)` is the
  deep-module home of the ritual (HTTP decision b79c09d4 made it a
  resource; this arc made it a method). MCP recover and HTTP GET /recover
  both delegate to it; the CLI verb calls it too. Types: RecoverOptions +
  RecoverReport + MemoryWithRelations + RelationsBlock in types.ts.

Shipped in the arc's single PR (bump 0.1.4):

- `get` gains the projection: a `relations` block `{out: [...], in: [...]}`
  — both directions, kind-labeled, raw (no resolution without the
  opt-in `relations --resolved`). One indexed query per direction
  (idx_edges_from / idx_edges_to). The get return type grew to
  `MemoryWithRelations`; additive, non-breaking.
- recover: summaries enriched via the same private `relationsBlock`
  helper; directives and objectives keep their caps and their plain
  Memory shape.
- Doctor: `broken_links` REMOVED from DoctorCheck (types.ts), from the
  check loop, and from `MEMORY_LINK_RE` (deleted from db.ts — the
  content-level link validation no longer exists). DOCTOR_CHECK_COUNT
  11 → 10; doctor help text and README updated (version-visible change).
  orphan_edges / self_edges / isolated_active untouched.
- SKILL.md: recover-first ritual rewritten (one call; manual ritual as
  the equivalent), one-gesture writing in "Writing good memories", the
  "Memory links" section became the legacy-layer note (version-tagged
  0.1.4), the dream template cites by graph (--relation) instead of
  memory:// prose, finish checklist untouched.
- README: recover row in the CLI table, one-gesture paragraph, get/
  relations/recover shapes in the HTTP table, doctor checks line, the
  How-it-works Graph bullet carries the single-surface statement.
- CONTEXT.md: the "Memory link" glossary entry tagged legacy (domain-doc
  coherence beyond the spec's listed files).
- Tests: get projection (both directions, raw, empty block), get island,
  doctor retirement test (a ghost prose link yields NO finding, healthy),
  checks count 10 in doctor + finish tests, MCP recover enrichment +
  get block, HTTP /recover enrichment, CLI recover spawnSync (enriched
  summaries + limit flags). Suite green, typecheck clean.
