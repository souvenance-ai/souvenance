# The store surface of the refonte: hot curation over weight and read-signal

souvenance v0.2.0 rebuilds the store surface verb by verb instead of porting it 1:1 — the legacy `Store` is raw material, and every verb must earn its place against observed agent usage. Three verbs die (`update`, `delete`, the standalone `relations`), `weight` and the `access_count` read-signal are dropped, and a single `hot` flag takes over curation: hot memories are what the recover ritual serves a fresh session. Schema v6 drops the dead columns and migrates the legacy recover's basket (active directives, summaries, and open objectives) to hot, so an existing individual recovers with the same memories it always did — now by explicit flag instead of kind convention. `kind` returns to being a free metadata tag. Search ranks by bm25 alone: search wants to search everywhere. Reads project the graph — `{out, in}` edges at depth 1, a `depth` option expanding out-edges (out expands, in informs). Unlink is a correction among the living: both endpoints must be active, which makes the supersedes/merges bridges untouchable by construction. There is no delete: terminations are deprecate and supersede; persistent memory obliges.

## Considered options

- **Port 1:1, prune later** — keep every verb and column, mark the unused. Rejected: the surface ships as the product's contract; a catch-all invites agents into rituals nobody performs (observed: kinds unreliably tagged, weight and the read signal untouched).
- **Keep weight/access_count as ranking inputs** — simplify around them. Rejected: two hidden feedback mechanisms (the search read-signal bumped access_count behind the caller's back) for a ranking no agent tuned; hot is visible, explicit, and agent-controlled.
- **Hot as an addition to the kind blocks** — recover keeps directives/summaries/objectives and gains hot. Rejected for v0.2.0: four curation mechanisms where one explicit gesture suffices; the kind-block caps silently dropped what they did not serve.
- **Migrate the basket by weight (≥ 0.8 floor)** — the only mechanical signal the legacy carried. Rejected in favor of kind: the floor was a doctor recommendation, not an enforced convention; the kind basket reproduces exactly what recover served.

## Consequences

- Schema v6 adds `hot` and drops `weight`/`access_count`; the migration is irreversible (the columns go) but preserves the recover basket via kind — old stores open and migrate.
- The hot invariant (hot only while active) is enforced at every status transition — supersede transfers, merge unions, every termination cools; a doctor check will verify it mechanically (#13).
- `update`, `delete`, and the `relations` verb register in the backlog with reactivation criteria ([Backlog: store surface — future tracks](https://github.com/souvenance-ai/souvenance/issues/28)).
- The server and MCP surfaces adjust accordingly: no PATCH/DELETE memory endpoint, no relations endpoint; a hot toggle appears; recover serves the hot block; search ranks by bm25.
- `Store.open` requires an explicit `dbPath` — the path is policy (config, manager), never a silent default the library guesses.
