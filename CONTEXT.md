# AI Memory

An opencode skill that gives an agent a persistent, searchable memory: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.

## Language

**Memory**:
A markdown document the agent stores, retrieves, and searches. The unit of the system.
_Avoid_: note, entry, record, item

**Content**:
The markdown body of a memory. May include `memory://` links to other memories or external resources.
_Avoid_: text, body, payload

**Metadata**:
A JSON object attached to a memory holding agent-defined attributes (tags, kind, source, etc.). Queryable via SQLite JSON1. Attributes live here, not as graph edges.
_Avoid_: tags, properties, fields (use these only when referring to specific keys _inside_ metadata)

**Relation**:
A typed, directed edge between two memories (`from → to`) with a `kind` such as `references`, `extends`, or `contradicts`. The graph connects whole memories, not atomic facts.
_Avoid_: link, edge, connection (use these informally; "relation" is the canonical term in the schema and CLI)

**Kind** (relation):
The label on a relation describing how the source memory relates to the target (e.g. `references`, `extends`, `contradicts`). Free-form string, agent-defined.
_Avoid_: type, label

**Memory link**:
A `memory://<uuid>` reference inside a memory's content. Machine-resolvable by the `get` operation. Distinct from a relation: a link is authored text; a relation is a searchable graph edge. A link may optionally be materialized into a relation.
_Avoid_: pointer, reference (use "memory link" for the `memory://` scheme; "reference" is a relation _kind_)

**Search**:
Keyword (FTS5) retrieval over memory content, ranked by relevance, combinable with metadata filters. The agent's primary tool for finding relevant memories without loading the whole database.
_Avoid_: query, lookup (use "search" for text matching; "list" for metadata-only filtering)

**Frontier** (exploration):
The thread an agent follows through a large memory it cannot fit in context: search by keyword (small ranked results) → read matches → traverse relations to related memories → repeat, with `LIMIT` at every step. Never loads the whole DB.
_Avoid_: browsing, scanning

**Store**:
One agent's entire memory: the single SQLite database file (`.ai-memory/memory.db`) holding all memories and relations for a project. One file = one store = the individual's whole memory (see **Individual**); the store is the unit you duplicate, move, or back up. Never use "store" for a single memory — one memory is a **memory**.
_Avoid_: database, db (use "store" in domain prose; "database" for the implementation); using "store" for a single memory

**Individual**:
The persistent person that emerges from a store — the being the memory composes: directives as its constitution, summaries as its lived past, open objectives as its standing intent, the linked graph as its recorded experience. The **agent** is the disposable instantiation: a waking agent that runs the recovery ritual is the individual re-instantiated, and many agents may instantiate the SAME individual (across sessions and surfaces: CLI, HTTP, MCP) — while one store = one individual, and touching several stores in one session is the multiple-personality risk the server constraints rule out. Lived writing (the experience note, the evaluation grades) is authored by the individual through whichever instantiation is currently alive.
_Avoid_: persona, self, consciousness (metaphysical); conflating with "agent" — "agent" names the generic client process, "individual" names the store-born person whose continuity the store carries

**Status**:
The lifecycle state of a memory: `active`, `superseded`, `deprecated`, or `merged`. Determined by the addition-only model — memories are never overwritten or deleted, only superseded, deprecated, or merged. `search` and `list` default to `active` memories only; use `--all` to include others.
_Avoid_: state, lifecycle

**Supersede**:
Store a new version of a memory and mark the old one as `superseded`. The old memory's content is preserved; a `supersedes` relation links old to new. The new memory starts with a clean relation set (no inherited edges).
_Avoid_: replace, update (use "update" only for metadata changes)

**Deprecate**:
Mark a memory as `deprecated`, removing it from default `search` and `list` results without deleting it. The soft-delete equivalent of `delete`. The memory and its relations remain in the store.
_Avoid_: delete, remove, archive

**Merge**:
Combine two or more duplicate memories into a single new memory. Originals are marked `merged`; a `merges` relation links each original to the merged result. The merged memory starts with a clean relation set.
_Avoid_: combine, deduplicate, consolidate

**Fork**:
A store born from a store: `souvenance fork <path>` copies the whole store file to a new name — an exact `VACUUM INTO` snapshot, nothing added. From birth the two stores are individuals: they never re-sync and never cross-write; communication is read-only. If a fork should know its origin, its forker tells it — a memory stored in the child after the copy, in the forker's own words. An unused fork is a **dormant fork** (an archive); restoring it is rebirth, never resync. `fork` does no scheduling and no transport — protecting the files is the installer's backup software's job.
_Avoid_: backup (the verb does not schedule or transport anything), sync, mirror (a mirror is a dead read-only reflection; a fork is a potential individual)

**Finish**:
The closing ritual, the counterpart of recovery: one read-only call (`souvenance finish`) that gates on **doctor** and surfaces the session obligations the doctor cannot see (it validates the store, not the session) — a summary in the window, the experience note, and the **dream debt** (the volume line blocks; the session-end clause warns). A session is closable — a relaunch recommendable — only when finish reports healthy. Composed, never replacing: doctor stays standalone; finish runs it as its hard gate, the way `/recover` bundles the opening ritual.
_Avoid_: wrap-up, close (use "finish" for the verb and the ritual); treating finish as doctor's replacement (finish composes doctor)
