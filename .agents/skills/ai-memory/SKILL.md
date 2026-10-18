---
name: ai-memory
description: Store, retrieve, and search persistent markdown memories in a per-project SQLite store. Use when the agent needs to remember something across a session boundary, recall what was decided or learned earlier, or explore a large memory graph without loading the whole DB.
---

# AI Memory

A persistent, searchable memory for agents: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.

## When to use this skill

- **Recovering**: at the start of a session, follow the recovery protocol below to load prior context efficiently.
- **Searching**: you need context you don't have — before starting work, when asked a question, or when recalling a prior decision. Search by keyword, optionally filtered by metadata.
- **Storing**: a decision was made, a fact learned, a pattern noticed — anything worth recalling in a future session. Store it as a memory with metadata.
- **Retrieving**: you need a specific memory by its id, or a `memory://` link referenced in content.
- **Exploring**: the store is too large for context — follow the frontier loop (search → read → traverse relations → repeat).

## Recovery protocol

At the start of a session, recover prior context in three steps — then stop recovering and start working.

1. **Load directives** — `list --where "metadata->>'$.kind' = 'directive'" --limit 20`. These are binding rules that must be respected before acting.
2. **Load recent summaries** — `list --where "metadata->>'$.kind' = 'summary'" --limit 3`. These are the handoff from prior sessions: what was done, key decisions, what's next.
3. **Load open objectives** — `list --where "metadata->>'$.kind' = 'objective' AND metadata->>'$.state' = 'open'" --limit 10`. These are standing commitments that have no arc and no consumer: they await realization, and only recovery presents them.

**Served store**: when your only access to the store is HTTP (`memory serve`), `GET /recover` runs this same ritual in one call — `{directives, summaries, objectives, stats}` — and `GET /<name>/recover` reorients an agent mounted on an auxiliary store read-only, where no CLI verb works. Route details: README "HTTP server".

Trust the summaries. They are the recovery point — not a hint to re-derive, but the prior session's finished work. Do not re-run verification (tests, typecheck, git log, stats) that the summaries already report as done. If you need deeper context, follow links from the summaries — the frontier loop starts there, not from scratch.

## Domain vocabulary

See `CONTEXT.md` at the repo root for the canonical glossary: **memory**, **content**, **metadata**, **relation**, **kind**, **memory link**, **search**, **frontier**, **store**. Use these terms; they are the interface vocabulary.

## CLI

All commands go through `bin/memory.js` (`node bin/memory.js <command> ...`, or `memory <command> ...` if installed). Run `memory --help` for the full command reference. One-line examples:

```
memory store "The user prefers tabs over spaces" --metadata '{"kind":"preference"}' --weight 0.9
memory supersede <old-id> --content "Revised decision: use spaces" --metadata '{"kind":"preference"}' --weight 0.8
memory deprecate <id>
memory merge <id1> <id2> --content "Combined decision" --metadata '{"kind":"decision"}' --weight 0.7
memory update <id> --metadata '{"kind":"note"}'
memory update <id> --weight 0.95
memory delete <id> --force
memory link <from-id> <to-id> --kind references
memory fork <path> [--force]
memory search "tabs spaces" --where "metadata->>'$.kind' = 'note'" --limit 5
memory get <id>
memory list --where "metadata->>'$.kind' = 'decision'" --limit 20
memory list --min-weight 0.7
memory relations <id> --direction both [--resolved]
memory stats
memory tags
memory doctor [--fix]
```

Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store`, `supersede`, and `merge` print the bare id; `update`/`delete`/`link`/`deprecate` print a one-word confirmation. `doctor` prints a `DoctorReport` ({healthy, findings: [{check, id?, detail, hint}], summary}) and exits 1 when findings exist — a successful diagnosis, not an error.

`--db <path>` overrides the store location (default: `.ai-memory/memory.db`).

## FTS5 query tips

`memory search` uses SQLite FTS5, which tokenizes on word boundaries and matches whole tokens, not substrings. A multi-word query like `design alternatives rejected` requires **all** terms to appear in a memory; if no single memory contains all three, you get zero hits. Construct queries accordingly:

```
memory search "tabs"                         # single word — broadest
memory search "tabs OR spaces"               # either term — widen the net
memory search '"design alternatives"'        # quoted phrase — consecutive words
memory search '"design alternatives" rejected'  # phrase AND term
```

- **Single word** (`tabs`): matches any memory containing that token.
- **OR** (`tabs OR spaces`): matches memories containing either term.
- **Quoted phrase** (`"design alternatives"`): the words must appear consecutively. Use when order matters.
- **Combined** (`"design alternatives" rejected`): phrase plus additional terms (implicit AND).

- **Hyphenated identifiers** (`better-sqlite3`, `node:sqlite`): FTS5 tokenizes on hyphens and colons, splitting `better-sqlite3` into `better` and `sqlite3`. The bare token `sqlite3` may be interpreted as a column reference, causing a syntax error. Always quote hyphenated or colon-containing identifiers: `'"better-sqlite3"'` or `'"node:sqlite"'`.

If a search returns nothing, try simpler queries, OR alternatives, or individual keywords drawn from what you're looking for.

## Memory links

A **memory link** is a `memory://<uuid>` reference inside a memory's content. The `get` command resolves it to the full memory. Markdown links to external resources (http URLs, file paths) are just authored text — they are not graph edges.

A memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.

## Evolving memories (addition-only model)

Content is immutable — never overwrite a memory. Instead of updating or deleting, use these operations:

- **Revise a decision**: `memory supersede <old-id> --content "new content"` — stores a new version (status `active`), links the old one to it via a `supersedes` relation, and marks the old as `superseded`. Pass `--metadata <json>` to override; without it the successor inherits `kind` and `tags` from the source memory.
- **Soft-delete**: `memory deprecate <id>` — marks the memory as `deprecated`, hiding it from default `search` and `list` results without removing it.
- **Combine duplicates**: `memory merge <id1> <id2> [<id3> ...] --content "merged content" [--metadata <json>]` — stores a merged memory (status `active`), marks each original as `merged`, and links each original to the merged result via a `merges` relation.

`search` and `list` default to `active` memories only; pass `--all` to include superseded, deprecated, and merged memories in results. `get` always returns the memory as-is, including its status — follow `supersedes` or `merges` relations to find the current version. On relations, pass `--resolved` to have each superseded/merged target annotated with `resolved_to`, the current version reached via the bridges (raw fields are never rewritten; deprecated targets and broken chains stay bare).

## Writing good memories

A memory is read by a future session that has no prior context — write accordingly:

- **Self-contained.** Each memory should make sense on its own. A reader who never saw this session should understand it without preamble.
- **One concept per memory.** Split dense paragraphs covering multiple decisions into separate memories, then `link` them. Single-concept memories are more retrievable (better search hits) and more linkable (sharper graph edges).
- **Include search keywords.** Use the words you'd search for — terms of art, names, identifiers — directly in the content. FTS5 matches tokens, not semantics; if the keyword isn't in the text, the search won't find it.
- **Revise, don't overwrite.** When a decision changes, `supersede` the old memory rather than updating its content. This preserves the history of what was decided and when it changed.

## Exploration: the frontier loop

When the store is too large to load into context, explore it with the **frontier** loop — never load the whole DB:

1. **Search** by keyword (`memory search "..." --limit 5`). Get a small, ranked set.
2. **Read** the matches (`memory get <id>`). Pick the relevant ones.
3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising; when an edge lands on a superseded/merged memory, `--resolved` names the current version.
4. **Repeat** from step 1 with new keywords drawn from what you've read.

`LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.

## Dreaming: graph consolidation

Memories accumulate during action. Links lag behind content. Redundant or stale memories persist. The store needs periodic consolidation — **dreaming** — just as a human brain consolidates during sleep.

### When to dream

Dreaming is **threshold-triggered**, not self-selected. Check these thresholds at the end of a non-trivial session, or when the store feels tangled:

1. **Edge ratio**: run `memory stats`. If `edges / active_memories < 1.5`, the graph is under-linked — dream.
2. **Volume**: if `+10` or more new memories were stored since the last dream, dream.
3. **Session end**: after any non-trivial session, dream before sending your final message.

Before dreaming, run `memory doctor` — findings get repaired first (a dream consolidates what exists; it should never consolidate corruption).

If none of the thresholds are met, skip dreaming. Do not dream on every session — it is costly and should happen when the store has accumulated enough to benefit from it.

### The five dream operations

Run them in order. Each uses existing CLI commands — dreaming is a workflow, not new machinery.

1. **Relink** — find memories that mention entities (names, IDs, concepts) without graph edges to the corresponding memories. Audit a sample of recent memories: read their content, check `memory relations <id>`, and `memory link` missing connections. Target: bring the edge ratio above 2.0.

2. **Merge** — find active memories that cover the same concept, decision, or event. Search by keyword for each topic; if two memories say substantially the same thing, `memory merge <id1> <id2> --content "merged content" --metadata '{...}'`. Preserve the history — the originals are marked `merged`, the new one is `active`.

3. **Supersede** — find active decisions or summaries that are factually outdated. If a memory states something that a later memory contradicts or replaces, `memory supersede <old-id> --content "current truth"` (kind and tags inherit from the source unless overridden with `--metadata`). The old memory stays as `superseded`, preserving the history.

4. **Rebalance** — adjust `weight` values based on graph structure. The author sets weight at creation; the dream corrects it based on reality:
   - Memory referenced by many incoming edges → boost (importance is structural and emergent).
   - Memory with no incoming edges and old → decay toward 0 (isolated and cold).
   - Directives, summaries, and objectives should stay high (≥ 0.8) regardless of age — they are binding, high-signal, or standing intent. Objectives in particular accumulate no incoming edges over time (the work done under them cites arc decisions, not the objective) — never decay them for age or edge scarcity.
   - Use `memory update <id> --weight <0-1>` to adjust.

5. **Synthesize** — after relinking, merging, superseding, and rebalancing, look for **emergent patterns** the graph reveals that no single memory captures. Store a `kind: "dream"` memory that narrates the pattern — connections, tensions, or themes that surfaced during consolidation. This is the dream itself: not a fact, but a revelation. Link it to the memories it draws from.

### Dream memory format

```markdown
# Dream: <title>

## Date
<date>

## Trigger
<which threshold triggered the dream>

## What I found
<findings from each operation: links added, memories merged, memories superseded>

## Pattern
<the emergent insight — what the graph revealed that no single memory contained>

## Links
<memory:// links to the memories this dream draws from>
```

### What dreaming is not

- Not a search. You are not looking for something specific — you are seeing what is already there.
- Not a rewrite. You are not editing content — you are adding edges, merging duplicates, and superseding stale facts.
- Not optional when triggered. If a threshold is met, dream. The store's integrity depends on it.

## Finishing

Before sending your final message in any session, run through this checklist. These are not suggestions — they are obligations from directives you have agreed to. You will forget them if they are not in front of you. They are in front of you now.

1. **Store a task summary** — `kind: "summary"`. What was done, key decisions, what's next. Link it to the memories it references. This is required after every non-trivial task, not just at the end of a session. A relaunch recommendation is only valid when this summary exists — a stale handoff looks healthy to the next session.

2. **Store the experience note** — the standing-evaluation practice. One short memory (`kind: "note"`, tags including "evaluation") on how the memory served you this session: retrieval hits and misses, queries that returned nothing, friction, gotchas. You are the memory's own evaluator — this lived data is what no external test produces, and it feeds improvement.

3. **Update open objectives** — state changes at decision time, not at session end: complete an objective (`state: "done"`), park it (`"parked"` with its wake condition in the content), or open a new one (`state: "open"`, weight 0.85, linked to what it affects). Search rank rewards engagement; standing intent is the least engaging class — present it, never hope to find it.

4. **Store the conversation** — if a directive requires storing conversations (e.g., bilingual directive), store the full conversation as a single bilingual memory: English summary first, original text appended under `## Original (Français)`.

5. **Check dream thresholds** — run `memory stats`. If any threshold is met (edge ratio < 1.5, +10 new memories since last dream, or end of non-trivial session), run the five dream operations: relink, merge, supersede, rebalance, synthesize. Store a `kind: "dream"` memory with the results.

6. **Link everything** — ensure memories created this session are linked to related memories. An unlinked memory is an island. Check the most recent memories: `memory relations <id>`. Add missing edges.

Run this checklist before you write your final message. Not after. Before.

## Conventions

- The store lives at `.ai-memory/memory.db` (gitignored). One store per project.
- UUID v4 ids; `memory://` link scheme.
- WAL mode for concurrent reads; writes retry on busy.
- Schema migrates on open — no manual migration step.
- The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.
- **Directives.** Store strict rules, constraints, and gotchas as `kind: "directive"`. Check directives before acting: `list --where "metadata->>'$.kind' = 'directive'"`. Directives are few and high-signal; they should override routine memories when they conflict.
- **Objectives.** Standing commitments with no arc and no consumer — they await a realization, not a feature request. Store as `kind: "objective"` with `state` in metadata: `"open"` (active commitment, loaded by the recovery ritual), `"parked"` (waits for its named wake condition, written in the content), `"done"` (realized). Author at weight 0.85; the doctor flags below 0.8; the dream never decays them. Open one the moment a goal outlives the session that named it — the recovery ritual presents open objectives every session.
- **Task summaries.** When you complete a non-trivial task, store a `kind: "summary"` memory recapping what was done, key decisions, and what's next — do this before sending your final message. A fresh session loads summaries via the recovery protocol to get oriented before diving in. Link the summary to the memories it references.
- **Weight.** Every memory has a `weight` (0–1, default 0.5) that reflects its importance. The author sets it at creation (`--weight 0.9`); the dream rebalance phase adjusts it based on graph structure. Search combines BM25 × weight × recency — higher-weight memories rank first. Use `list --min-weight 0.7` to filter hot memories. A fresh agent can read weight without learning the kind vocabulary: 0.9 means important.
