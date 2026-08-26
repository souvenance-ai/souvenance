---
name: ai-memory
description: Store, retrieve, and search persistent markdown memories in a per-project SQLite store. Use when the agent needs to remember something across a session boundary, recall what was decided or learned earlier, or explore a large memory graph without loading the whole DB.
---

# AI Memory

A persistent, searchable memory for agents: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.

## When to use this skill

- **Directives**: before starting work, check for `kind: "directive"` memories — strict rules, constraints, and gotchas that must be respected before acting. Run `list --where "metadata->>'$.kind' = 'directive'"` first.
- **Searching**: you need context you don't have — before starting work, when asked a question, or when recalling a prior decision. Search by keyword, optionally filtered by metadata.
- **Storing**: a decision was made, a fact learned, a pattern noticed — anything worth recalling in a future session. Store it as a memory with metadata.
- **Retrieving**: you need a specific memory by its id, or a `memory://` link referenced in content.
- **Exploring**: the store is too large for context — follow the frontier loop (search → read → traverse relations → repeat).

## Domain vocabulary

See `CONTEXT.md` at the repo root for the canonical glossary: **memory**, **content**, **metadata**, **relation**, **kind**, **memory link**, **search**, **frontier**, **store**. Use these terms; they are the interface vocabulary.

## CLI

All commands go through `bin/memory.js` (`node bin/memory.js <command> ...`, or `memory <command> ...` if installed). Run `memory --help` for the full command reference. One-line examples:

```
memory store "The user prefers tabs over spaces" --metadata '{"kind":"preference"}'
memory supersede <old-id> --content "Revised decision: use spaces" --metadata '{"kind":"preference"}'
memory deprecate <id>
memory merge <id1> <id2> --content "Combined decision" --metadata '{"kind":"decision"}'
memory update <id> --metadata '{"kind":"note"}'
memory delete <id> --force
memory link <from-id> <to-id> --kind references
memory search "tabs spaces" --where "metadata->>'$.kind' = 'note'" --limit 5
memory get <id>
memory list --where "metadata->>'$.kind' = 'decision'" --limit 20
memory relations <id> --direction both
memory stats
memory tags
```

Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store`, `supersede`, and `merge` print the bare id; `update`/`delete`/`link`/`deprecate` print a one-word confirmation.

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

If a search returns nothing, try simpler queries, OR alternatives, or individual keywords drawn from what you're looking for.

## Memory links

A **memory link** is a `memory://<uuid>` reference inside a memory's content. The `get` command resolves it to the full memory. Markdown links to external resources (http URLs, file paths) are just authored text — they are not graph edges.

A memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.

## Evolving memories (addition-only model)

Content is immutable — never overwrite a memory. Instead of updating or deleting, use these operations:

- **Revise a decision**: `memory supersede <old-id> --content "new content" [--metadata <json>]` — stores a new version (status `active`), links the old one to it via a `supersedes` relation, and marks the old as `superseded`.
- **Soft-delete**: `memory deprecate <id>` — marks the memory as `deprecated`, hiding it from default `search` and `list` results without removing it.
- **Combine duplicates**: `memory merge <id1> <id2> [<id3> ...] --content "merged content" [--metadata <json>]` — stores a merged memory (status `active`), marks each original as `merged`, and links each original to the merged result via a `merges` relation.

`search` and `list` default to `active` memories only; pass `--all` to include superseded, deprecated, and merged memories in results. `get` always returns the memory as-is, including its status — follow `supersedes` or `merges` relations to find the current version.

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
3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising.
4. **Repeat** from step 1 with new keywords drawn from what you've read.

`LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.

## Dreaming: graph consolidation

Memories accumulate during action. Links lag behind content. Redundant or stale memories persist. The store needs periodic consolidation — **dreaming** — just as a human brain consolidates during sleep.

### When to dream

Dreaming is **threshold-triggered**, not self-selected. Check these thresholds at the end of a non-trivial session, or when the store feels tangled:

1. **Edge ratio**: run `memory stats`. If `edges / active_memories < 1.5`, the graph is under-linked — dream.
2. **Volume**: if `+10` or more new memories were stored since the last dream, dream.
3. **Session end**: after any non-trivial session, dream before sending your final message.

If none of the thresholds are met, skip dreaming. Do not dream on every session — it is costly and should happen when the store has accumulated enough to benefit from it.

### The four dream operations

Run them in order. Each uses existing CLI commands — dreaming is a workflow, not new machinery.

1. **Relink** — find memories that mention entities (names, IDs, concepts) without graph edges to the corresponding memories. Audit a sample of recent memories: read their content, check `memory relations <id>`, and `memory link` missing connections. Target: bring the edge ratio above 2.0.

2. **Merge** — find active memories that cover the same concept, decision, or event. Search by keyword for each topic; if two memories say substantially the same thing, `memory merge <id1> <id2> --content "merged content" --metadata '{...}'`. Preserve the history — the originals are marked `merged`, the new one is `active`.

3. **Supersede** — find active decisions or summaries that are factually outdated. If a memory states something that a later memory contradicts or replaces, `memory supersede <old-id> --content "current truth" --metadata '{...}'`. The old memory stays as `superseded`, preserving the history.

4. **Synthesize** — after relinking, merging, and superseding, look for **emergent patterns** the graph reveals that no single memory captures. Store a `kind: "dream"` memory that narrates the pattern — connections, tensions, or themes that surfaced during consolidation. This is the dream itself: not a fact, but a revelation. Link it to the memories it draws from.

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

## Conventions

- The store lives at `.ai-memory/memory.db` (gitignored). One store per project.
- UUID v4 ids; `memory://` link scheme.
- WAL mode for concurrent reads; writes retry on busy.
- Schema migrates on open — no manual migration step.
- The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.
- **Directives.** Store strict rules, constraints, and gotchas as `kind: "directive"`. Check directives before acting: `list --where "metadata->>'$.kind' = 'directive'"`. Directives are few and high-signal; they should override routine memories when they conflict.
- **Task summaries.** When you complete a non-trivial task, store a `kind: "summary"` memory recapping what was done, key decisions, and what's next — do this before sending your final message. A fresh session searches for `kind: "summary"` to get oriented before diving in. Link the summary to the memories it references.
