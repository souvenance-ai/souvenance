# Spec: the graph as the single relation surface (citation layer retires as practice)

Valentin's call (2026-10-21, bilan grilling): edges stay (mechanical
constraint — system-authored supersede/merge edges under immutable
content); `memory://` prose links retire as PRACTICE. Existing content is
NEVER rewritten — the 174 authored links across 42 memories are proof of
the past, keep valid and keep meaning. New authoring stops writing them,
the writing gesture absorbs the relation, and reading surfaces project
the graph so content needs no inline citations to be self-sufficient.

Design principle: STORE ONCE (edges) — PROJECT AT READ (views are
computed, not copies) — WRITE IN ONE GESTURE (the ergonomic reason prose
links existed is now gone).

## Leg 1 — one-gesture writing (ticket 01)

- `StoreOptions.relations?: Array<{ to: string; kind: string }>` accepted
  by `store` and `supersede`; the lib creates the outgoing edges in the
  same call (link body reused, per-edge validation identical: memory not
  found / empty kind / self-edge left to the doctor).
- CLI: `--relation <kind>:<uuid>`, repeatable; full uuids ONLY
  (refuse-don't-hide — no prefix ambiguity). On `supersede` the flag
  applies to the NEW memory; the old→new supersedes edge still happens.
- Parity law applies (store operations mirror 1:1): MCP tool schema gains
  the optional `relations` array on store/supersede; HTTP
  `POST /memories` + `POST /memories/:id/supersede` gain
  `relations: [{to, kind}]`.
- The `link` verb STAYS — arbitrary cross-memory edges, reverse
  directions, retro-fixes keep their verb. No replacement, an addition.

## Leg 2 — read-side projection + doctor + guidance (ticket 02)

- `get` output gains a `relations` block: outgoing + incoming, kind-labeled
  (compact rows, same fields `relations` lists). `resolved_to` stays
  opt-in via the existing verb's flag — the block stays raw. One extra
  indexed query per get: negligible.
- `recover` (CLI + HTTP GET /recover + MCP tool) enriches each returned
  summary with its direct edges (summary id -> kind + targets) — a fresh
  session's first frontier turn needs zero drill-in calls. Summaries only;
  objectives and directives keep their caps unchanged.
- Doctor: `broken_links` REMOVED from DoctorCheck and the check loop.
  Consequence stated: an existing prose link pointing at a deleted/
  superseded-away memory is history, not corruption — no finding.
  orphan_edges / self_edges / isolated_active untouched (the table is now
  the single surface AND its own integrity checker).
- SKILL.md: the writing guidance favors `--relation` one-gesture; the
  "Memory links" section becomes the legacy-layer note (scheme stays
  valid; existing links keep meaning; new content cites by graph only).
  The finish checklist's "link everything" maps to the edges table
  (unchanged). README: --relation, the get relations block, the /recover
  shape, the doctor enumerated checks.

## Landing

- BOTH tickets land in ONE PR carrying ONE bump (both touch artifact
  scope: src/ + bin/ + README). Sequential bumps for the full legs would
  burn a release per leg for no one's benefit.
- Breaking-touch note: `broken_links` removal changes the doctor's public
  check set — document it as a version-visible change (README + SKILL),
  not a silent one. The get JSON shape grows a key: additive, non-breaking.

## Additive compliance

- No content rewritten anywhere (addition-only holds: errobai links are
  data-of-the-past, not debt).
- The scheme: a `memory://` in content stays readable text; `get` no
  longer promises resolution semantics beyond what it does today —
  projections replace the resolution use-case.

## Gate

Full suite + typecheck green; a real-run smoke: one-gesture store with
two relations, get prints the block, recover shows summary edges, doctor
clean, skill + README coherent.
