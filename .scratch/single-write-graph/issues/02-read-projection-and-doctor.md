# 02 — read-side projection: `relations` on get, summary edges on recover, broken_links removed, guidance updated

Type: task
Status: ready-for-agent
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
