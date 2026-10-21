# 01 — supersede edge inheritance: the new head starts unlinked

Type: task
Status: resolved
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

## The RULING (Valentin delegated the call — "go statuer", 2026-10-21)

**Option (b) auto-copy, under the house inheritance law — outgoing only,
row-verbatim, explicit wins.** Session-decided with Valentin's delegation;
recorded as decision memory + in the arc's PR.

The deciding argument was an existing precedent, not a new preference:
`supersede` ALREADY inherits kind and tags from the source (and merge
unions them) — "explicit --metadata is used verbatim; no explicit →
inherit". Outgoing edges are the relational identity of a thought; a
revision corrects CONTENT, not the relation set. Auto-copy + the built-in
escape (explicit `--relation` replaces the inherited set verbatim, exactly
the way explicit `--metadata` overrides kind/tags) covers both the 90%
case (correction keeps its references — zero extra gesture, the cold
friction dies) and the rare case (the revision itself changes the
references — declare them explicitly, one gesture, replace semantics).

Why not the alternatives:
- (a) status quo: keeps a ceremony on the COMMON case and reads the
  help phrase "relations attach to the NEW memory" as a trap (it holds
  only for explicit flags) — the exact friction the cold test lived.
- (c) opt-in flag: adds a NEW flag to express the default the other two
  rules already imply; the escape exists in `--relation`'s replace
  semantics, a second lever is ceremony without payoff.

## Implementation (lands in the arc's PR, bump 0.1.4 — no extra bump)

- Lib (`Store.supersede`): with NO explicit relations, the source's
  outgoing edges are copied INTO THE HEAD row-verbatim (kind, metadata,
  created_at), read BEFORE the supersedes bridge (the copy set is exactly
  what was authored — an old→this-new edge cannot exist pre-bridge).
  Each target existence is pre-validated like insertRelations:
  refuse-don't-hide ("memory not found: <id>" precisely, the ROLLBACK
  keeps the old memory active and unbridged — a hand-corrupted orphan
  edge blocks the supersede loudly, it does not nobody-gets-silently-
  truncated). With explicit relations: NO copy — verbatim replaces
  inheritance. The old memory KEEPS its edges + the bridge
  (addition-only; nothing moves, both memories carry provenance).
- Outgoing ONLY: incoming edges are other memories' authored facts —
  copying them would author on the neighbors' behalf. They keep
  pointing at the (superseded) old; `--resolved` walks the bridge at
  read.
- Self-edges: the copy runs before the bridge, and a source self-edge
  (old→old) maps to head→old — odd but not a self-edge; the doctor's
  self_edges check still speaks for the STORE's self-edge (the LIB
  refused-to-create self edge is covered by the one-gesture
  impossibility). No special case — corruption stays visible.
- Surfaces: the behavior is lib-level, so CLI / MCP / HTTP inherit it
  unchanged; help Notes + supersede MCP description + HTTP endpoint
  note + SKILL.md bullet + README supersede row state it
  (version-visible).
- Tests: lib ×3 (verbatim copy incl. created_at + provenance kept +
  doctor clean; explicit replaces; orphan-source refusal rolls
  everything back), CLI spawnSync (plain supersede → inherited edge),
  HTTP + MCP one assert each (the ruling shows through both surfaces).
  Suite 319/319 green, typecheck clean, live smoke on the arc's scratch
  store (plain supersede → head carries references, old keeps edges +
  bridge, doctor healthy).

## Deliberately NOT in this ruling

`merge` does NOT inherit its sources' outgoing edges (status quo). A
merge is a combination of claims, not a claim's replacement; the ruling
sets the precedent — if lived demand shows merged heads routinely need
the sources' references, one ticket makes it follow the same law
(inherit unions). Filed here so the precedent note survives the ticket
close.

## Why filed now

The single-write spec wrote "the relations (explicit) attach to the
NEW memory" and left inheritance unstated — the cold test made the
missing rule lived. Whatever is ruled should be version-visible.
