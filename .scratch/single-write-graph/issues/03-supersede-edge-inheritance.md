# 01 — supersede edge inheritance: the new head starts unlinked

Type: task
Status: needs-triage
Filed by: the cold CLI contract test of PR #8 (single-write-graph arc, 2026-10-21)

## Observed cold behavior

A cold subagent (CLI-only, `--help`-only discovery) ran: store
decision --relation references:<objective>, then supersede to
corrected content WITHOUT --relation. Result: the new head carries
only the auto supersedes bridge; the decision's outgoing references
edge stayed on the OLD (now superseded) memory. The agent had to
re-link by hand and wrote in its report:

> supersede inherits kind/tags from the source but silently leaves
> outgoing edges on the old memory — the new head starts life
> unlinked, isolated_active was two steps away. The help's phrase
> "the relations attach to the NEW memory" refers only to explicitly
> passed --relations, easy to misread as inheritance.

## The design question (Valentin's ruling needed)

Inheritance of METADATA (kind/tags) exists by design. Inheritance of
OUTGOING EDGES does not. Three candidate rules:

a) **Status quo** — edges stay where they were authored (the old
   memory keeps its references as provenance; the agent re-links the
   head). Refuse nothing, copy nothing. Cost: one extra gesture per
   revision, observed live.
b) **Auto-copy** — supersede copies the old memory's outgoing
   references to the new head (addition-only OK: new authored facts
   on the new memory). Every supersede becomes a full replacement
   without a re-link gesture.
c) **Opt-in flag** — `--copy-relations` (or a default with an
   escape flag). Explicitness preserved, gesture per revision still
   required except when opted in.

Mirrors the kind/tags inheritance precedent (auto is the default
there, --metadata overrides). If auto-copy is ruled in, tests + help +
SKILL.md + MCP/HTTP mirror: 4 surfaces, own bump if binary-reached.

## Why filed now

The single-write spec wrote "the relations (explicit) attach to the
NEW memory" and left inheritance unstated — the cold test made the
missing rule lived. Whatever is ruled should be version-visible.
