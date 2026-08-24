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
The SQLite database file (`.ai-memory/memory.db`) holding all memories and relations for a project.
_Avoid_: database, db (use "store" in domain prose; "database" for the implementation)
