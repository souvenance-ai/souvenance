# souvenance

Persistent, searchable memory for AI agents: typed graphs of memories in SQLite stores, served over HTTP and MCP stdio.

## Language

### The experience

**Individual**:
The experiencer: one store (its memory) animated by an agent. Anchored on the store — two agents sharing one store are not two individuals.
_Avoid_: person, user, subject

**Agent**:
The caller that animates an individual's store — through the server, never through the manager.
_Avoid_: user, bot, client (that's the CLI)

**Operator**:
The human who runs the manager and owns the host — the only audience of `souvenance`. On the wire, the loopback caller with no bearer at all: read-write plus manage on every store. Off loopback there is no operator — tokens only.
_Avoid_: user, admin, anonymous access

**Memory**:
One record in a store: content, its kind, its authored summary, metadata, and a status (active, hot, superseded, deprecated, merged).
_Avoid_: note, fact, recollection

**Kind**:
The required classification of a memory — a column with a free vocabulary, no enum. Demanded at birth by store; a revision may reclassify it (supersede); a merge inherits it when the sources agree and demands a verdict when they disagree. `unclassified` marks the debt of a row nobody classified.
_Avoid_: type, category, tag (that's metadata)

**Summary**:
The authored condensation of a memory's content — what checkin and search serve to hand a fresh session more memories per call. Owed at write time when the content runs past the ceiling; condensed always; revised by supersede, never in place.
_Avoid_: abstract, digest, tldr

**Metadata**:
The free JSON an agent authors on a memory, beside the columns — searchable by typed scalar equality on dot-paths. Its keys obey the filter's path grammar at authoring time: one grammar, both surfaces, everything stored stays addressable.
_Avoid_: properties, custom fields, tags (a data convention, not a surface)

**Hot**:
The curation status: the sub-state of `active` a fresh session's checkin serves. Not a flag, not a parallel mark — one of the five states, the machine's only reversible edge (setHot: active ↔ hot); supersede transfers it to the head, merge unions it, every termination cools it for free.
_Avoid_: pinned, starred, important, the hot flag (retired)

**Living**:
The set of memories still on stage: `active` + `hot` (hot is a sub-state of active). The refusal set of the write verbs — supersede, merge, deprecate, and unlink's endpoints only ever touch the living; the terminals (superseded, deprecated, merged) refuse every gesture. The checkout reads it too: a hot memory owes its relations and its title as much as an active one.
_Avoid_: non-terminal, actives, alive

**Relation**:
A directed edge between two memories (from → to, with a kind). The graph is the single relation surface; reading surfaces project it.
_Avoid_: link (that's the verb), edge, connection

### The objects

**Store**:
One SQLite memory database — an individual's memory. The unit of ownership (one owner at a time) and of token scoping.
_Avoid_: database, memory bank, bucket

**Mount**:
The `/stores/<name>/…` URL scheme: a store the server serves under its name in the one guarded namespace — management and data alike. No root store, no routes outside it.
_Avoid_: mount point, attachment, root store, top-level routes

**Fork**:
An exact copy of a store as a new store — the act by which one individual becomes two.
_Avoid_: clone, copy, backup

**Cursor**:
The serving key of the last memory served — the pair (`created_at`, `id`). `list` takes the next page strictly after it; the server hands it to its clients opaque and rebuilds it from the last served node. The UUID's lexicographic order breaks any millisecond tie.
_Avoid_: offset (retired), page token, bookmark

### The surfaces

**Server**:
The HTTP process where individuals exist: memory operations and store management. The single enforcement point for auth, scoping, and caps.
_Avoid_: gateway, daemon, backend

**Manager**:
The `souvenance` CLI — the operator's tool for local state: server lifecycle, config, tokens, offline maintenance.
_Avoid_: admin CLI, control CLI

**Client**:
The `souv` CLI — a thin consumer of the server API for agents and scripts; never touches local state.
_Avoid_: proxy CLI

**MCP bridge**:
The stdio MCP server as a pure client of the server — never a second owner of stores.
_Avoid_: MCP server (ambiguous with the HTTP server)

### Access

**Ownership lock**:
The one-owner-at-a-time rule over a store: while the server owns it, every operation flows through the server; when nobody owns it, the manager may open it directly.
_Avoid_: file lock, mutex

**Online verb**:
An operation that flows through the running server.
_Avoid_: proxy verb

**Offline verb**:
A manager operation that opens the store directly; refuses while the server owns the store.
_Avoid_: direct verb, local verb

**Grant**:
A bearer token's authority: one agent, one store, one mode (`ro`/`rw`), and an optional manage cap. A row of the config's `tokens[]` — nothing else exists to present.
_Avoid_: token file (retired), credential, API key

**Manage cap**:
The default-deny grant capability to create, fork, list, and delete stores.
_Avoid_: admin cap, root token

**Registry**:
The stores dir as the store inventory: every `<name>.db` in it is a store, none is declared, and boot opens them all or refuses to serve. The dir is the truth — no list beside it to drift.
_Avoid_: declared stores, store list, catalog

### The rituals

**Checkin**:
The session-start ritual: the hot memories (with their relations) and the store's stats in one call.
_Avoid_: recover, boot, restore

**Checkout**:
The agent's session-end verdict: the store reports its consolidation debts — the register's curation and its islands — in one call; the light goes green only when every debt is paid, each payable with the raw verbs. Corruption is not the gate's business.
_Avoid_: finish, close

**Doctor**:
The corruption audit of a store, for the operator: the states the write surface cannot produce (hand SQL, external tools), every finding payable in SQL. The checkout's complement — the agent's gate, the operator's audit.
_Avoid_: diagnose, verify, integrity check
