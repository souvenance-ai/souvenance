---
name: ai-memory
description: Store, retrieve, and search persistent markdown memories in a per-project SQLite store. Use when the agent needs to remember something across a session boundary, recall what was decided or learned earlier, or explore a large memory graph without loading the whole DB.
---

# AI Memory

A persistent, searchable memory for agents: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.

## When to use this skill

- **Storing**: a decision was made, a fact learned, a pattern noticed — anything worth recalling in a future session. Store it as a memory with metadata.
- **Retrieving**: you need a specific memory by its id, or a `memory://` link referenced in content.
- **Searching**: you need memories matching keywords, optionally filtered by metadata, without loading the whole store.
- **Exploring**: the store is too large for context — follow the frontier loop (search → read → traverse relations → repeat).

## Domain vocabulary

See `CONTEXT.md` at the repo root for the canonical glossary: **memory**, **content**, **metadata**, **relation**, **kind**, **memory link**, **search**, **frontier**, **store**. Use these terms; they are the interface vocabulary.

## CLI

All commands go through `bin/memory.js` (`node bin/memory.js <command> ...`, or `memory <command> ...` if installed). Run `memory --help` for the full command reference. One-line examples:

```
memory store "The user prefers tabs over spaces" --metadata '{"kind":"preference"}'
memory update <id> --content "Updated content" --metadata '{"kind":"note"}'
memory delete <id>
memory link <from-id> <to-id> --kind references
memory search "tabs spaces" --where "metadata->>'$.kind' = 'note'" --limit 5
memory get <id>
memory list --where "metadata->>'$.kind' = 'decision'" --limit 20
memory relations <id> --direction both
memory stats
```

Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.

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

## Writing good memories

A memory is read by a future session that has no prior context — write accordingly:

- **Self-contained.** Each memory should make sense on its own. A reader who never saw this session should understand it without preamble.
- **One concept per memory.** Split dense paragraphs covering multiple decisions into separate memories, then `link` them. Single-concept memories are more retrievable (better search hits) and more linkable (sharper graph edges).
- **Include search keywords.** Use the words you'd search for — terms of art, names, identifiers — directly in the content. FTS5 matches tokens, not semantics; if the keyword isn't in the text, the search won't find it.

## Exploration: the frontier loop

When the store is too large to load into context, explore it with the **frontier** loop — never load the whole DB:

1. **Search** by keyword (`memory search "..." --limit 5`). Get a small, ranked set.
2. **Read** the matches (`memory get <id>`). Pick the relevant ones.
3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising.
4. **Repeat** from step 1 with new keywords drawn from what you've read.

`LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.

## Conventions

- The store lives at `.ai-memory/memory.db` (gitignored). One store per project.
- UUID v4 ids; `memory://` link scheme.
- WAL mode for concurrent reads; writes retry on busy.
- Schema migrates on open — no manual migration step.
- The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.
- **Session summaries.** At the end of a session, store a `kind: "summary"` memory recapping what was done, key decisions, and what's next. A fresh session searches for `kind: "summary"` to get oriented before diving in. Link the summary to the memories it references.
