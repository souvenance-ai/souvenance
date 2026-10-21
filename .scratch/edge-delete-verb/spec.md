# Spec: edge removal — `unlink` (or delete edges via `relations`)

Found live during the 2026-10-21 evening dream: the dream's authoring linked by search-by-prefix — FTS captured the QUOTING memory (whose content cites the target ids) instead of the quoted. Wrong targets and a self-edge followed; the repair had to `delete` the dream and `store` it again, because **a wrong edge cannot be removed** — `link` creates edges and nothing removes them (checked `--help` 2026-10-21: no unlink verb), and cascades only fire on whole-memory `delete`.

## Requirements

1. A CLI verb for edge removal — either `souvenance unlink <from-id> <to-id> [--kind <kind>]` (often the edge is identified by its endpoints) or an optional `--remove` mode on an existing command. Free-form `kind` means endpoint identity + kind fully determines an edge; without `--kind`, refusing with a listing of the candidate edges beats guessing (same "refuse, don't hide" grammar as token-file parsing).
2. MCP + HTTP parity (all surfaces mirror verbs 1:1 — the project's surface law): MCP tool `unlink`; HTTP `DELETE /relations` or equivalent.
3. Tests: create→unlink→verify-removed round trip; refusal on ambiguous endpoints (multiple edges between the pair); not-found on a missing edge.
4. Docs: README command table row, SKILL.md one-liner.

## Non-goals

- No edge updates via this verb (kinds are free-form but edges are immutable — recreate instead, same addition-only spirit as conversations, kept cheap BECAUSE removal exists).
- No cascade options — edge removal is one-edge-scoped, deliberately narrower than memory delete.
