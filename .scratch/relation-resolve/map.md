# Map: Relation Resolve

## Destination

An opt-in read-time resolution over the relation graph: `relations(id, { resolve: true })` (CLI `--resolved`) annotates every relation whose target memory is `superseded` or `merged` with `resolved_to` — the terminal successor reached by following the `supersedes`/`merges` bridges. Raw relation fields stay untouched; the store keeps every historical relation. No pruning, no deletion, no auto-redirect.

## Notes

**Domain**: ai-memory skill (`src/db.ts`, `src/types.ts`, `bin/memory.js`, `.agents/skills/ai-memory/SKILL.md`, `CONTEXT.md`). Vocabulary per CONTEXT.md: "relation" is the canonical term for a typed graph edge.

**Observations that shaped this** (queried 2026-10-15, real store):
- 67 relations total: 42 `references: active→active`, 12 `references: active→superseded`, 2 `superseded→superseded`, 5 `superseded→active`, plus 6 `supersedes` bridges.
- The 12 `active→superseded` relations are the live pain: a frontie walker landing on a superseded memory must know the supersedes convention and hop manually; nothing in the library or CLI supports the hop.

**Recorded decisions this must respect** (perfect-memory-model):
- Supersede shape: old relations stay as-is; the `supersedes` relation is the only bridge between versions.
- `get` does no auto-redirect — the store surfaces raw state; resolution lives in the consumer, opt-in.
- Addition-only: content immutable; lifecycle via status transitions; no physical deletion except `delete --force`.

**Standing preferences**:
- Library-first (deep module): resolution logic in `Store`, CLI is a thin flag passthrough.
- Opt-in flag, default OFF: raw output byte-identical to today's when the flag is absent.
- Annotation, never rewrite: `resolved_to` is an added optional field; `from_id`/`to_id`/`kind`/`metadata`/`created_at` never change.
- Chains are linear by construction (supersede/merge require an active source, so a memory can never be replaced twice); a visited-set still guards defensively.
- `deprecated` targets resolve to nothing (deprecation is a termination, not a replacement).

**Skills every session should consult**: `domain-modeling` if terms shift; `writing-for-agents` for the SKILL.md edits; `tdd` for the test-alongside rhythm.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Resolution shape](issues/01-library-resolution.md): Opt-in `resolve` in `relations()` adds `resolved_to` (optional field on `Relation`) by walking the unique `supersedes`/`merges` bridge chain to the terminal active memory. **Pruning (relation deletion) rejected** — contradicts addition-only + "old relations stay as-is"; no storage pressure motivates it. **Auto-resolve by default rejected** — violates the no-auto-redirect decision; raw state must stay raw. Shipped: 162/162 tests, tsc clean.
- [CLI + skill](issues/02-cli-and-skill-guidance.md): `memory relations <id> [--resolved]` passes the flag through; HELP + Notes updated; SKILL.md carries the semantics in the evolving-memories paragraph and the frontier step. Verified end-to-end on a throwaway store.

## Not yet specified

- Post-resolution relink: a helper that would re-point relations at dream time to the successor (write-side repair). Deferred — the "dream is the repair station" routine does relinking per-case, and the resolved view may make that enough.

## Out of scope

- `memory://` content-link resolution (perfect-memory-model future idea; separate question from relation resolution).
- `memory history <id>` chain-walker command (perfect-memory-model future idea).
- Any write-time pruning or alias/redirect mechanism.
