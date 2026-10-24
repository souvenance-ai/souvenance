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
The human who runs the manager and owns the host — the only audience of `souvenance`.
_Avoid_: user, admin

**Memory**:
One record in a store: content, its authored summary, metadata, a status (active, superseded, deprecated, merged), and the hot flag.
_Avoid_: note, fact, recollection

**Summary**:
The authored condensation of a memory's content — what checkin and search serve to hand a fresh session more memories per call. Owed at write time when the content runs past the ceiling; condensed always; revised by supersede, never in place.
_Avoid_: abstract, digest, tldr

**Hot**:
The curation flag of an active memory: what checkin serves a fresh session. Only an active memory can be hot; supersede transfers it to the head, merge unions it, every termination cools it.
_Avoid_: pinned, starred, important

**Relation**:
A directed edge between two memories (from → to, with a kind). The graph is the single relation surface; reading surfaces project it.
_Avoid_: link (that's the verb), edge, connection

### The objects

**Store**:
One SQLite memory database — an individual's memory. The unit of ownership (one owner at a time) and of token scoping.
_Avoid_: database, memory bank, bucket

**Mount**:
A store the server serves under a URL segment (`/<name>/…`).
_Avoid_: mount point, attachment

**Fork**:
An exact copy of a store as a new store — the act by which one individual becomes two.
_Avoid_: clone, copy, backup

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
A bearer token's authority: its store, its write opt-in (rw), and its `where` opt-in.
_Avoid_: token file (retired), credential

**Manage cap**:
The default-deny grant capability to create, fork, list, and delete stores.
_Avoid_: admin cap, root token

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
