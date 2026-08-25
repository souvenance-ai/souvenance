# Wayfinder skill: decision-ticket planning

**Session ID:** ses_fc84c6cffffe4NwTWwjfKejTZb
**Created:** 8/25/2026, 8:55:10 AM
**Updated:** 8/25/2026, 8:56:37 AM

---

## User

A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its **decision tickets** (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting: it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic: engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes**, carrying execution into the map itself, but absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket is an issue, so it has a **name**: its title. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish; a name wraps its link, but they ride _inside_ the name, never stand in for it.

## The Map

The map is a single issue on this repo's issue tracker, labelled `wayfinder:map`, the canonical artifact. Its tickets are child issues of the map.

The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place, its ticket, so the map never restates it, only gists it and links.

**Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. If no tracker has been provided, default to the local-markdown tracker.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are **not** listed: they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like: the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link): <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a **child issue** of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).

A session **claims** a ticket by assigning it to the dev driving the map, **first**, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed.

Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.

The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.

## Ticket Types

Every ticket is either **HITL** (human in the loop, worked _with_ a human who speaks for themselves) or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that calls the Skill tool with "research". Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation. The default case. Always call the Skill tool twice, for "grilling" and "domain-modeling".
- **Task** (HITL or AFK): Manual work that must happen before a _decision_ can be made: nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that _does_ rather than decides, and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war**: the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets, one at a time, until the way to the destination is clear and no tickets remain.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination: everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

**Fog or ticket?** The test is whether you can state the question precisely now, _not_ whether you can answer it now.

- **Ticket when** the question is already sharp, even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope**: it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates (the frontier stops at the destination), so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session**, with the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Call the Skill tool twice, for "grilling" and "domain-modeling", to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** (the way to the destination is already clear, the whole journey small enough for one session), you don't need a map. Stop and ask the user how they'd like to proceed.
3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child issues of the map, then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog: the **Not yet specified** section.
5. **Fire the research subagents.** For each `research` ticket you just created, spin up a subagent that calls the Skill tool with "research" to resolve it in parallel, capturing its findings on a throwaway `research/<name>` branch with a context pointer from the ticket.
6. Stop: charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional**: without one, you pick the next decision, not the user.

1. Load the **map**: the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.
3. Resolve it. **Zoom as needed**: fetch the full body of any related or closed ticket on demand; call the Skill tool for whichever skills the `## Notes` block names. If in doubt, call the Skill tool twice, for "grilling" and "domain-modeling".
4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.

The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.


Base directory for this skill: /home/valentin/code/ai/ai-memory/.agents/skills/wayfinder
Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.

.scratch/ai-memory-skill/map.md

---

## Assistant (Build · euria-code · 2.9s)

_Thinking:_

The user has invoked the wayfinder skill. Let me understand what's happening here.

The user has provided the full wayfinder skill instructions, and at the very end there's a reference to `../.scratch/ai-memory-skill/map.md`. This appears to be an existing wayfinder map.

Let me first understand the context:
1. There's a skill called "wayfinder" that helps plan large efforts as a shared map of decision tickets on an issue tracker
2. The user seems to be invoking this skill - they've pasted the skill content
3. There's a reference to `../.scratch/ai-memory-skill/map.md` at the end

Let me start by reading the existing map file and understanding the issue tracker setup for this repo. According to the skill, the issue tracker should have been provided, and if not, I should tell the user to run `/setup-matt-pocock-skills`. Let me check what's available.

Let me read:
1. The map file at `../.scratch/ai-memory-skill/map.md`
2. The issue tracker documentation
3. Any existing tickets

Let me also check the AGENTS.md and the docs/agents directory for tracker info.

I'll start by loading the existing map and understanding the issue tracker setup for this repo.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/map.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/map.md</path>
<type>file</type>
<content>
1: # Map: AI Memory Skill
2: 
3: ## Destination
4: 
5: An opencode skill (CLI via bash, Node + `node:sqlite`) that lets an agent store, retrieve, and search markdown memories in a per-project SQLite DB, with FTS5 text search, a typed directed graph between memories, JSON metadata, `memory://<id>` links, WAL concurrency, and migrate-on-open schema. The build fits one session; this map charts the slices.
6: 
7: ## Notes
8: 
9: **Domain**: see `CONTEXT.md` for the glossary (memory, relation, kind, memory link, search, frontier) and `docs/adr/0001` for the graph-over-triple-store decision.
10: 
11: **Skills every session should consult**: `implement` or `implement-spec` for the build tickets; `domain-modeling` if terms shift; `tdd` if tests are wanted alongside.
12: 
13: **Standing preferences**:
14: - opencode-only for now; portability deferred.
15: - Library is the deep module; the skill is the thin agent-facing contract.
16: - `node:sqlite` (Node 22+ built-in), not better-sqlite3.
17: - Per-project store at `.ai-memory/memory.db` (gitignored).
18: - UUID v4 ids; `memory://<id>` link scheme.
19: - WAL mode + busy-retry for concurrency.
20: - Schema version table, migrate-on-open.
21: 
22: ## Decisions so far
23: 
24: <!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->
25: 
26: - [Scaffold and schema](issues/01-scaffold-and-schema.md): project scaffold + `Store.open()` with WAL, FK pragmas, busy-retry, v1 schema (memories/edges/schema_version/memories_fts + triggers), migrate-on-open; 5/5 smoke tests green.
27: 
28: - [Write operations](issues/02-write-operations.md): `store`/`update`/`delete`/`link` on `Store`; UUID v4 ids, idempotent edges (`INSERT OR IGNORE`), existence checks + clear errors, FTS/FK cascade via triggers; 25/25 tests green.
29: 
30: - [Read operations](issues/03-read-operations.md): `search`/`get`/`list`/`relations`/`stats` on `Store`; FTS5 `bm25` ranking, metadata `where` filters (raw SQL on JSON), `get` returns `null` for unknown id, `relations` throws; 51/51 tests green.
31: 
32: - [CLI entry and commands](issues/04-cli-entry.md): `bin/memory.js` (plain JS, executable) maps all 9 commands to `Store` methods; stdout JSON results, stderr errors, exit 1 on failure; `--db` override, `--metadata` JSON, `--where` raw SQL; 14/14 smoke tests + 6 error paths green; typecheck clean.
33: 
34: ## Not yet specified
35: 
36: <!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->
37: 
38: _None yet._ The design tree is fully settled; the frontier is the build itself. If implementation surfaces a new decision (e.g. FTS5 tokenizer config, metadata index strategy, `memory://` link auto-materialization into edges), graduate it here into a ticket.
39: 
40: ## Out of scope
41: 
42: <!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
43: 
44: - **MCP server / typed-tool transport.** CLI via bash is the v1 transport. MCP is a later, separate effort behind the same library.
45: - **Multi-tool portability (Claude Code, Cursor, etc.).** opencode-only for v1.
46: - **Vector / semantic search / embeddings.** Structured SQL + FTS5 only. Embeddings are a later layer if needed.
47: - **Dynamic DDL / agent-defined tables.** Fixed schema; agents impose structure via `metadata` JSON.
48: - **Triple-store / RDF model.** Ruled out by ADR-0001; see `docs/adr/0001-labeled-property-graph-over-triple-store.md`.
49: - **`unlink` CLI command.** Edge deletion is trivial to add later; v1 ships `link` only.

(End of file - total 49 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/docs/agents/issue-tracker.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/docs/agents/issue-tracker.md</path>
<type>file</type>
<content>
1: # Issue tracker: Local Markdown
2: 
3: Issues and specs for this repo live as markdown files in `.scratch/`.
4: 
5: ## Conventions
6: 
7: - One feature per directory: `.scratch/<feature-slug>/`
8: - The spec is `.scratch/<feature-slug>/spec.md`
9: - Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
10: - Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
11: - Comments and conversation history append to the bottom of the file under a `## Comments` heading
12: 
13: ## When a skill says "publish to the issue tracker"
14: 
15: Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).
16: 
17: ## When a skill says "fetch the relevant ticket"
18: 
19: Read the file at the referenced path. The user will normally pass the path or the issue number directly.
20: 
21: ## Wayfinding operations
22: 
23: Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.
24: 
25: - **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
26: - **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
27: - **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
28: - **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
29: - **Claim**: set `Status: claimed` and save before any work.
30: - **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

(End of file - total 30 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/AGENTS.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/AGENTS.md</path>
<type>file</type>
<content>
1: ## Agent skills
2: 
3: ### Issue tracker
4: 
5: Issues live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.
6: 
7: ### Triage labels
8: 
9: Five canonical roles; label strings equal role names. See `docs/agents/triage-labels.md`.
10: 
11: ### Domain docs
12: 
13: Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

(End of file - total 13 lines)
</content>
```

---

## Assistant (Build · euria-code · 3.0s)

_Thinking:_

Let me understand the current state of the map. The map is for an "AI Memory Skill" - an opencode skill that lets agents store/retrieve/search markdown memories in a per-project SQLite DB.

Looking at the Decisions so far:
1. Scaffold and schema - done (resolved)
2. Write operations - done (resolved)
3. Read operations - done (resolved)
4. CLI entry and commands - done (resolved)

The "Not yet specified" section says "_None yet._" - the design tree is fully settled, and the frontier is the build itself.

So all 4 tickets are closed. The fog is empty. But wait - the map says the destination is a complete opencode skill. Let me check: what's left? The 4 tickets cover:
1. Scaffold + schema
2. Write operations
3. Read operations
4. CLI entry and commands

The destination describes: "store, retrieve, and search markdown memories in a per-project SQLite DB, with FTS5 text search, a typed directed graph between memories, JSON metadata, `memory://<id>` links, WAL concurrency, and migrate-on-open schema."

Looking at what's been done:
- Schema with FTS5, edges, WAL, migrate-on-open ✓
- Write operations (store/update/delete/link) ✓
- Read operations (search/get/list/relations/stats) ✓
- CLI entry mapping all 9 commands ✓

But wait - the destination says "An opencode skill". The tickets so far have built the library and CLI, but is there a skill definition file? Let me check what exists in the repo to understand the current state.

Let me also check: are there any open tickets I'm missing? Let me look at the issues directory.

Let me check the current state of the issues directory and the codebase.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues</path>
<type>directory</type>
<entries>
01-scaffold-and-schema.md
02-write-operations.md
03-read-operations.md
04-cli-entry.md
05-skill-authoring.md
06-integration-test.md

(6 entries)
</entries>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/CONTEXT.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/CONTEXT.md</path>
<type>file</type>
<content>
1: # AI Memory
2: 
3: An opencode skill that gives an agent a persistent, searchable memory: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.
4: 
5: ## Language
6: 
7: **Memory**:
8: A markdown document the agent stores, retrieves, and searches. The unit of the system.
9: _Avoid_: note, entry, record, item
10: 
11: **Content**:
12: The markdown body of a memory. May include `memory://` links to other memories or external resources.
13: _Avoid_: text, body, payload
14: 
15: **Metadata**:
16: A JSON object attached to a memory holding agent-defined attributes (tags, kind, source, etc.). Queryable via SQLite JSON1. Attributes live here, not as graph edges.
17: _Avoid_: tags, properties, fields (use these only when referring to specific keys _inside_ metadata)
18: 
19: **Relation**:
20: A typed, directed edge between two memories (`from → to`) with a `kind` such as `references`, `extends`, or `contradicts`. The graph connects whole memories, not atomic facts.
21: _Avoid_: link, edge, connection (use these informally; "relation" is the canonical term in the schema and CLI)
22: 
23: **Kind** (relation):
24: The label on a relation describing how the source memory relates to the target (e.g. `references`, `extends`, `contradicts`). Free-form string, agent-defined.
25: _Avoid_: type, label
26: 
27: **Memory link**:
28: A `memory://<uuid>` reference inside a memory's content. Machine-resolvable by the `get` operation. Distinct from a relation: a link is authored text; a relation is a searchable graph edge. A link may optionally be materialized into a relation.
29: _Avoid_: pointer, reference (use "memory link" for the `memory://` scheme; "reference" is a relation _kind_)
30: 
31: **Search**:
32: Keyword (FTS5) retrieval over memory content, ranked by relevance, combinable with metadata filters. The agent's primary tool for finding relevant memories without loading the whole database.
33: _Avoid_: query, lookup (use "search" for text matching; "list" for metadata-only filtering)
34: 
35: **Frontier** (exploration):
36: The thread an agent follows through a large memory it cannot fit in context: search by keyword (small ranked results) → read matches → traverse relations to related memories → repeat, with `LIMIT` at every step. Never loads the whole DB.
37: _Avoid_: browsing, scanning
38: 
39: **Store**:
40: The SQLite database file (`.ai-memory/memory.db`) holding all memories and relations for a project.
41: _Avoid_: database, db (use "store" in domain prose; "database" for the implementation)

(End of file - total 41 lines)
</content>
```

**Tool: glob**

**Input:**
```json
{
  "pattern": "**/*.{js,ts,json}",
  "path": "/home/valentin/code/ai/ai-memory/src"
}
```

**Output:**
```
/home/valentin/code/ai/ai-memory/src/db.test.ts
/home/valentin/code/ai/ai-memory/src/types.ts
/home/valentin/code/ai/ai-memory/src/writes.test.ts
/home/valentin/code/ai/ai-memory/src/db.ts
/home/valentin/code/ai/ai-memory/src/migrations.ts
/home/valentin/code/ai/ai-memory/src/reads.test.ts
```

---

## Assistant (Build · euria-code · 1.3s)

_Thinking:_

Let me look at the existing open tickets (05 and 06) to understand what's on the frontier, and also check the package.json and the bin directory to understand the current state of the project.

Let me read the open tickets and check the current project state.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/05-skill-authoring.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/05-skill-authoring.md</path>
<type>file</type>
<content>
1: # Skill authoring (SKILL.md)
2: 
3: Type: task
4: Status: open
5: Blocked by: 04
6: 
7: ## Question
8: 
9: Author the opencode skill at `.agents/skills/ai-memory/` so the agent knows when and how to use the memory.
10: 
11: **Scope:**
12: 
13: 1. **SKILL.md** at `.agents/skills/ai-memory/SKILL.md`. Follow the conventions of existing skills in `.agents/skills/` (read 2-3 neighbors for the shape). Contents:
14:    - **Description**: when to use this skill (storing, retrieving, searching memories during a session).
15:    - **Invocation**: the CLI commands (reference `bin/memory.js`), with one-line examples.
16:    - **Domain vocabulary**: point to `CONTEXT.md` for terms (memory, relation, kind, memory link, search, frontier).
17:    - **Exploration pattern**: document the frontier loop — search by keyword → read matches → traverse relations → repeat with `LIMIT`. This is how an agent explores a large memory without loading the whole DB.
18: 
19: 2. **Memory-link convention**: document the `memory://<id>` scheme and that the `get` command resolves these. Note that markdown links to external resources (http, file paths) are just authored text, not graph edges.
20: 
21: 3. **Do not** duplicate the CLI reference or the domain glossary inside SKILL.md; link to them. The skill is the thin contract; the library and `CONTEXT.md` hold the detail.
22: 
23: **Acceptance**: a fresh agent reading SKILL.md knows what the skill does, when to reach for it, how to call each command, and how to explore a large memory. Matches the tone and structure of neighbor skills.

(End of file - total 23 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/06-integration-test.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/06-integration-test.md</path>
<type>file</type>
<content>
1: # Integration test and gitignore
2: 
3: Type: task
4: Status: open
5: Blocked by: 04
6: 
7: ## Question
8: 
9: Tie the pieces together with an end-to-end integration test, and ensure the store is gitignored.
10: 
11: **Scope:**
12: 
13: 1. **Integration test**: a script (Node, run via `yarn test` or similar) that exercises the full flow against a temporary DB:
14:    - Open a fresh store at a temp path.
15:    - `store` three memories with metadata (tags, kind).
16:    - `link` two of them with a `references` relation.
17:    - `search` for a keyword and assert the right memory ranks first.
18:    - `list` with a metadata filter and assert the right subset.
19:    - `relations` on a memory and assert the edge.
20:    - `get` an unknown id and assert the documented error behavior.
21:    - `delete` a memory and assert its edges cascade away.
22:    - `stats` and assert the counts.
23:    This proves the pieces compose; unit smoke-tests in earlier tickets prove the pieces individually.
24: 
25: 2. **`.gitignore`**: add `.ai-memory/` so per-project stores are not committed.
26: 
27: 3. **README**: a minimal `README.md` at the repo root (or a `README` section) noting the skill, the Node 22+ requirement, and how to run the CLI. This is optional; only if the repo has no other README content.
28: 
29: **Acceptance**: `yarn test` (or the equivalent) runs the integration test green against a temp DB; `.ai-memory/` is gitignored; the skill is documented enough for a new agent to use it.

(End of file - total 29 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/package.json"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/package.json</path>
<type>file</type>
<content>
1: {
2:   "name": "ai-memory",
3:   "version": "0.1.0",
4:   "description": "Persistent, searchable agent memory in a per-project SQLite store",
5:   "type": "module",
6:   "packageManager": "yarn@4.18.0",
7:   "engines": {
8:     "node": ">=22"
9:   },
10:   "bin": {
11:     "memory": "bin/memory.js"
12:   },
13:   "scripts": {
14:     "typecheck": "tsc --noEmit -p tsconfig.json",
15:     "test": "node --experimental-strip-types --test src/**/*.test.ts"
16:   },
17:   "devDependencies": {
18:     "@types/node": "^26.2.0",
19:     "typescript": "5.8.3"
20:   }
21: }

(End of file - total 21 lines)
</content>
```

**Tool: glob**

**Input:**
```json
{
  "pattern": "bin/**/*"
}
```

**Output:**
```
/home/valentin/code/ai/ai-memory/bin/memory.js
```

**Tool: glob**

**Input:**
```json
{
  "pattern": "src/**/*.ts"
}
```

**Output:**
```
/home/valentin/code/ai/ai-memory/src/db.test.ts
/home/valentin/code/ai/ai-memory/src/types.ts
/home/valentin/code/ai/ai-memory/src/writes.test.ts
/home/valentin/code/ai/ai-memory/src/db.ts
/home/valentin/code/ai/ai-memory/src/migrations.ts
/home/valentin/code/ai/ai-memory/src/reads.test.ts
```

---

## Assistant (Build · euria-code · 1.6s)

_Thinking:_

Let me understand the current state:

1. The map has 4 decisions resolved (tickets 01-04), all closed.
2. Two open tickets remain: 05 (skill authoring) and 06 (integration test), both blocked by 04 which is now resolved.
3. Both are unblocked since ticket 04 is resolved.
4. Both are unclaimed (Status: open).

The frontier is tickets 05 and 06. Since the user didn't name a specific ticket, I pick the first frontier ticket in order, which is 05 (skill authoring).

Let me verify that ticket 04 is indeed resolved (it's in Decisions so far), so 05 and 06 are unblocked.

Let me check ticket 04's status to confirm it's resolved.

Let me verify the resolved status of ticket 04 and check the existing skills for conventions.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/04-cli-entry.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/04-cli-entry.md</path>
<type>file</type>
<content>
1: # CLI entry and commands
2: 
3: Type: task
4: Status: resolved
5: Blocked by: 02, 03
6: 
7: ## Question
8: 
9: Implement the CLI entry point in `bin/` that maps bash invocations to library operations.
10: 
11: **Scope:**
12: 
13: 1. **Entry script** (`bin/memory.js`, executable, shebang `#!/usr/bin/env node`): parse `argv` into subcommand + args + flags. Exit non-zero on error, print a human/agent-readable message to stderr.
14: 
15: 2. **Commands**, mapping to the library:
16:    - `memory store <content> [--metadata <json-string>]` → `store`, prints the new `id` to stdout.
17:    - `memory update <id> [--content <text>] [--metadata <json-string>]` → `update`.
18:    - `memory delete <id>` → `delete`.
19:    - `memory link <from-id> <to-id> --kind <relation> [--metadata <json-string>]` → `link`.
20:    - `memory search <query> [--where <json-path-filter>] [--limit N]` → `search`, prints results as JSON lines or a table (pick one and document).
21:    - `memory get <id>` → `get`, prints the memory as JSON.
22:    - `memory list [--where <json-path-filter>] [--limit N] [--offset N]` → `list`.
23:    - `memory relations <id> [--direction out|in|both]` → `relations`.
24:    - `memory stats` → `stats`.
25: 
26: 3. **Output format**: stdout is for results (JSON, one document per command), stderr is for errors. Non-zero exit on any failure so the agent can react programmatically.
27: 
28: 4. **Path resolution**: the DB path defaults to `.ai-memory/memory.db` in the current working directory. Support a `--db <path>` override flag for testing.
29: 
30: **Acceptance**: every library operation is reachable from the CLI. Inputs are parsed and validated; errors exit non-zero with a message; successes print JSON to stdout. Smoke-test each command end-to-end via `node bin/memory.js ...`.
31: 
32: ## Answer
33: 
34: Done. `bin/memory.js` (plain JS, executable, `#!/usr/bin/env node`).
35: 
36: **What was built:**
37: 
38: - **Entry script** (`bin/memory.js`): parses `argv` into subcommand + positional args + `--flag value` pairs via a small `parseArgs` helper. `--db <path>` overrides the store path. `--help`/`-h` prints usage. Unknown commands exit 1 with the help text on stderr.
39: 
40: - **Commands**, all mapping to `Store` methods:
41:   - `store <content> [--metadata <json>]` → `store.store()`, prints the new `id` to stdout (bare string, one line — easy for agents to capture).
42:   - `update <id> [--content <text>] [--metadata <json>]` → `store.update()`, prints `updated`.
43:   - `delete <id>` → `store.delete()`, prints `deleted`.
44:   - `link <from-id> <to-id> --kind <kind> [--metadata <json>]` → `store.link()`, prints `linked`.
45:   - `search <query> [--where <sql>] [--limit N]` → `store.search()`, prints `SearchResult[]` as a pretty-printed JSON document (chose JSON over JSON-lines/tables: one parseable document per command is the simplest contract for an agent consumer).
46:   - `get <id>` → `store.get()`, prints the memory as JSON. Prints `not found: <id>` to stderr and exits 1 for unknown ids (matches the library's `null`-on-unknown contract — missing memories are surfaced, not thrown).
47:   - `list [--where <sql>] [--limit N] [--offset N]` → `store.list()`, prints `Memory[]` as JSON.
48:   - `relations <id> [--direction out|in|both]` → `store.relations()`, prints `Relation[]` as JSON.
49:   - `stats` → `store.stats()`, prints the `Stats` object as JSON.
50: 
51: - **Output format**: stdout for results (JSON, pretty-printed with 2-space indent); stderr for errors (`error: <message>`); exit 0 on success, exit 1 on any failure. `store`/`update`/`delete`/`link` print a one-word confirmation; the rest print JSON.
52: 
53: - **Path resolution**: defaults to `.ai-memory/memory.db` (via `Store.open()`); `--db <path>` override passes through to `Store.open({ dbPath })`.
54: 
55: - **Metadata parsing**: `--metadata` accepts a JSON string; invalid JSON exits 1 with a clear message.
56: 
57: **Design decisions:**
58: - Plain JS (not `.ts`): the CLI is a thin shell over the library. Node 24 strips types on `.ts` import, so `bin/memory.js` imports `../src/db.ts` directly — no build step, no `--experimental-strip-types` flag needed at runtime.
59: - `get` on unknown id prints to stderr + exits 1 (rather than printing `null` to stdout): agents checking `exit` code get a clean signal; the `null`-returning library contract is preserved internally.
60: - `search` query is the join of all positional args after `search` (so multi-word queries work without quoting: `memory search warm cats`).
61: 
62: **Verification:**
63: - `yarn typecheck`: clean (0 errors).
64: - `yarn test`: 51/51 pass (unchanged; CLI has no unit tests, smoke-tested manually).
65: - Smoke-tested all 14 paths end-to-end against a temp DB: store×3, link, search (ranked), get (found + unknown), list (with `--where`), relations, stats, update, delete (cascade verified), help, unknown command. Plus 6 error paths: empty content, update unknown, delete unknown, link missing `--kind`, link unknown target, invalid metadata JSON — all exit 1 with clear stderr messages.
66: 
67: **Facts later tickets depend on:**
68: - The CLI is `bin/memory.js`, executable, plain JS importing `../src/db.ts`. Run via `node bin/memory.js <command> ...` or `memory <command> ...` (the `bin` entry in `package.json`).
69: - `--db <path>` overrides the store location for testing.
70: - Output contract: JSON results on stdout (pretty-printed), `error: <msg>` on stderr, exit 1 on failure. `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.
71: - `--metadata` takes a JSON string; `--where` takes a raw SQL fragment on the `metadata` JSON column (e.g. `metadata->>'$.kind' = 'note'`).
72: - `get` on unknown id: stderr `not found: <id>`, exit 1.

(End of file - total 72 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/wayfinder/SKILL.md",
  "limit": 60
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/wayfinder/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: wayfinder
3: description: Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
4: disable-model-invocation: true
5: ---
6: 
7: A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its **decision tickets** (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.
8: 
9: The destination varies per effort, and naming it is the first act of charting: it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic: engineering work, course content, whatever fits the shape.
10: 
11: ## Plan, don't do
12: 
13: Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes**, carrying execution into the map itself, but absent that, produce decisions, not deliverables.
14: 
15: ## Refer by name
16: 
17: Every map and ticket is an issue, so it has a **name**: its title. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish; a name wraps its link, but they ride _inside_ the name, never stand in for it.
18: 
19: ## The Map
20: 
21: The map is a single issue on this repo's issue tracker, labelled `wayfinder:map`, the canonical artifact. Its tickets are child issues of the map.
22: 
23: The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place, its ticket, so the map never restates it, only gists it and links.
24: 
25: **Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. If no tracker has been provided, default to the local-markdown tracker.
26: 
27: ### The map body
28: 
29: The whole map at low resolution, loaded once per session. Open tickets are **not** listed: they are open child issues, found by query.
30: 
31: ```markdown
32: ## Destination
33: 
34: <what reaching the end of this map looks like: the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>
35: 
36: ## Notes
37: 
38: <domain; skills every session should consult; standing preferences for this effort>
39: 
40: ## Decisions so far
41: 
42: <!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->
43: 
44: - [<closed ticket title>](link): <one-line gist of the answer>
45: 
46: ## Not yet specified
47: 
48: <!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->
49: 
50: ## Out of scope
51: 
52: <!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
53: ```
54: 
55: ### Tickets
56: 
57: Each ticket is a **child issue** of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session:
58: 
59: ```markdown
60: ## Question

(Showing lines 1-60 of 128. Use offset=61 to continue.)
</content>
```

**Tool: glob**

**Input:**
```json
{
  "pattern": ".agents/skills/*/SKILL.md"
}
```

**Output:**
```
No files found
```

---

## Assistant (Build · euria-code · 0.8s)

**Tool: glob**

**Input:**
```json
{
  "pattern": ".agents/skills/**/SKILL.md"
}
```

**Output:**
```
No files found
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/src/types.ts"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/src/types.ts</path>
<type>file</type>
<content>
1: export type UUID = string;
2: 
3: export interface Memory {
4:   id: UUID;
5:   content: string;
6:   metadata: Record<string, unknown> | null;
7:   created_at: string;
8: }
9: 
10: export interface Relation {
11:   from_id: UUID;
12:   to_id: UUID;
13:   kind: string;
14:   metadata: Record<string, unknown> | null;
15:   created_at: string;
16: }
17: 
18: export interface StoreOptions {
19:   metadata?: Record<string, unknown>;
20: }
21: 
22: export interface UpdateOptions {
23:   content?: string;
24:   metadata?: Record<string, unknown>;
25: }
26: 
27: export interface SearchOptions {
28:   where?: string;
29:   limit?: number;
30: }
31: 
32: export interface ListOptions {
33:   where?: string;
34:   limit?: number;
35:   offset?: number;
36: }
37: 
38: export type Direction = "in" | "out" | "both";
39: 
40: export interface RelationsOptions {
41:   direction?: Direction;
42: }
43: 
44: export interface Stats {
45:   memories: number;
46:   edges: number;
47:   edges_by_kind: Record<string, number>;
48: }
49: 
50: export interface SearchResult {
51:   id: UUID;
52:   content: string;
53:   metadata: Record<string, unknown> | null;
54:   created_at: string;
55:   rank: number;
56: }

(End of file - total 56 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/src/db.ts"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/src/db.ts</path>
<type>file</type>
<content>
1: import { DatabaseSync } from "node:sqlite";
2: import { randomUUID } from "node:crypto";
3: import { mkdirSync } from "node:fs";
4: import { dirname, resolve } from "node:path";
5: import { migrate } from "./migrations.ts";
6: import type {
7:   StoreOptions,
8:   UpdateOptions,
9:   SearchOptions,
10:   ListOptions,
11:   RelationsOptions,
12:   Direction,
13:   Memory,
14:   Relation,
15:   Stats,
16:   SearchResult,
17: } from "./types.ts";
18: 
19: export const DEFAULT_DB_PATH = ".ai-memory/memory.db";
20: 
21: const SQLITE_BUSY = 5;
22: const BUSY_RETRIES = 50;
23: const BUSY_DELAY_MS = 20;
24: 
25: interface MemoryRow {
26:   id: string;
27:   content: string;
28:   metadata: string | null;
29:   created_at: string;
30: }
31: 
32: interface SearchRow {
33:   id: string;
34:   content: string;
35:   metadata: string | null;
36:   created_at: string;
37:   rank: number;
38: }
39: 
40: interface RelationRow {
41:   from_id: string;
42:   to_id: string;
43:   kind: string;
44:   metadata: string | null;
45:   created_at: string;
46: }
47: 
48: function parseMemoryRow(row: MemoryRow): Memory {
49:   return {
50:     id: row.id,
51:     content: row.content,
52:     metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
53:     created_at: row.created_at,
54:   };
55: }
56: 
57: function parseSearchRow(row: SearchRow): SearchResult {
58:   return {
59:     id: row.id,
60:     content: row.content,
61:     metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
62:     created_at: row.created_at,
63:     rank: row.rank,
64:   };
65: }
66: 
67: function parseRelationRow(row: RelationRow): Relation {
68:   return {
69:     from_id: row.from_id,
70:     to_id: row.to_id,
71:     kind: row.kind,
72:     metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
73:     created_at: row.created_at,
74:   };
75: }
76: 
77: export interface OpenOptions {
78:   /** Override the default `.ai-memory/memory.db` path. */
79:   dbPath?: string;
80: }
81: 
82: function execPragma(db: DatabaseSync): void {
83:   db.exec("PRAGMA journal_mode = WAL");
84:   db.exec("PRAGMA foreign_keys = ON");
85:   db.exec("PRAGMA busy_timeout = 5000");
86: }
87: 
88: export class Store {
89:   readonly db: DatabaseSync;
90:   readonly dbPath: string;
91: 
92:   private constructor(db: DatabaseSync, dbPath: string) {
93:     this.db = db;
94:     this.dbPath = dbPath;
95:   }
96: 
97:   static open(opts: OpenOptions = {}): Store {
98:     const dbPath = resolve(opts.dbPath ?? DEFAULT_DB_PATH);
99:     mkdirSync(dirname(dbPath), { recursive: true });
100:     const db = new DatabaseSync(dbPath);
101:     execPragma(db);
102:     migrate(db);
103:     return new Store(db, dbPath);
104:   }
105: 
106:   store(content: string, opts: StoreOptions = {}): string {
107:     if (!content) throw new Error("content must be non-empty");
108:     const id = randomUUID();
109:     const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
110:     const created_at = new Date().toISOString();
111:     this.run(() => {
112:       this.db
113:         .prepare(
114:           "INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)",
115:         )
116:         .run(id, content, metadata, created_at);
117:     });
118:     return id;
119:   }
120: 
121:   update(id: string, opts: UpdateOptions): void {
122:     if (opts.content === undefined && opts.metadata === undefined) {
123:       throw new Error("at least one of content or metadata must be provided");
124:     }
125:     const existing = this.db
126:       .prepare("SELECT 1 FROM memories WHERE id = ?")
127:       .get(id);
128:     if (!existing) throw new Error(`memory not found: ${id}`);
129: 
130:     const sets: string[] = [];
131:     const params: (string | null)[] = [];
132:     if (opts.content !== undefined) {
133:       if (!opts.content) throw new Error("content must be non-empty");
134:       sets.push("content = ?");
135:       params.push(opts.content);
136:     }
137:     if (opts.metadata !== undefined) {
138:       sets.push("metadata = ?");
139:       params.push(JSON.stringify(opts.metadata));
140:     }
141:     params.push(id);
142:     this.run(() => {
143:       this.db
144:         .prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`)
145:         .run(...params);
146:     });
147:   }
148: 
149:   delete(id: string): void {
150:     const existing = this.db
151:       .prepare("SELECT 1 FROM memories WHERE id = ?")
152:       .get(id);
153:     if (!existing) throw new Error(`memory not found: ${id}`);
154:     this.run(() => {
155:       this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
156:     });
157:   }
158: 
159:   link(
160:     fromId: string,
161:     toId: string,
162:     kind: string,
163:     opts: StoreOptions = {},
164:   ): void {
165:     if (!kind) throw new Error("kind must be non-empty");
166:     const fromExists = this.db
167:       .prepare("SELECT 1 FROM memories WHERE id = ?")
168:       .get(fromId);
169:     if (!fromExists) throw new Error(`memory not found: ${fromId}`);
170:     const toExists = this.db
171:       .prepare("SELECT 1 FROM memories WHERE id = ?")
172:       .get(toId);
173:     if (!toExists) throw new Error(`memory not found: ${toId}`);
174: 
175:     const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
176:     const created_at = new Date().toISOString();
177:     this.run(() => {
178:       this.db
179:         .prepare(
180:           "INSERT OR IGNORE INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
181:         )
182:         .run(fromId, toId, kind, metadata, created_at);
183:     });
184:   }
185: 
186:   close(): void {
187:     this.db.close();
188:   }
189: 
190:   search(query: string, opts: SearchOptions = {}): SearchResult[] {
191:     if (!query) throw new Error("query must be non-empty");
192:     const limit = opts.limit ?? 20;
193:     let sql = `SELECT m.id, m.content, m.metadata, m.created_at, bm25(memories_fts) AS rank FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?`;
194:     const params: (string | number)[] = [query];
195:     if (opts.where) {
196:       sql += ` AND ${opts.where}`;
197:     }
198:     sql += ` ORDER BY rank LIMIT ?`;
199:     params.push(limit);
200:     const rows = this.db.prepare(sql).all(...params) as unknown as SearchRow[];
201:     return rows.map(parseSearchRow);
202:   }
203: 
204:   get(id: string): Memory | null {
205:     const row = this.db
206:       .prepare("SELECT id, content, metadata, created_at FROM memories WHERE id = ?")
207:       .get(id) as unknown as MemoryRow | undefined;
208:     if (!row) return null;
209:     return parseMemoryRow(row);
210:   }
211: 
212:   list(opts: ListOptions = {}): Memory[] {
213:     const limit = opts.limit ?? 20;
214:     const offset = opts.offset ?? 0;
215:     let sql = `SELECT id, content, metadata, created_at FROM memories`;
216:     const params: (string | number)[] = [];
217:     if (opts.where) {
218:       sql += ` WHERE ${opts.where}`;
219:     }
220:     sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
221:     params.push(limit, offset);
222:     const rows = this.db.prepare(sql).all(...params) as unknown as MemoryRow[];
223:     return rows.map(parseMemoryRow);
224:   }
225: 
226:   relations(id: string, opts: RelationsOptions = {}): Relation[] {
227:     const existing = this.db
228:       .prepare("SELECT 1 FROM memories WHERE id = ?")
229:       .get(id);
230:     if (!existing) throw new Error(`memory not found: ${id}`);
231: 
232:     const direction: Direction = opts.direction ?? "both";
233:     const rows: RelationRow[] = [];
234: 
235:     if (direction === "out" || direction === "both") {
236:       const outRows = this.db
237:         .prepare(
238:           `SELECT from_id, to_id, kind, metadata, created_at FROM edges WHERE from_id = ? ORDER BY created_at DESC`,
239:         )
240:         .all(id) as unknown as RelationRow[];
241:       rows.push(...outRows);
242:     }
243: 
244:     if (direction === "in" || direction === "both") {
245:       const inRows = this.db
246:         .prepare(
247:           `SELECT from_id, to_id, kind, metadata, created_at FROM edges WHERE to_id = ? ORDER BY created_at DESC`,
248:         )
249:         .all(id) as unknown as RelationRow[];
250:       rows.push(...inRows);
251:     }
252: 
253:     return rows.map(parseRelationRow);
254:   }
255: 
256:   stats(): Stats {
257:     const memCount = this.db
258:       .prepare("SELECT count(*) AS c FROM memories")
259:       .get() as { c: number };
260:     const edgeCount = this.db
261:       .prepare("SELECT count(*) AS c FROM edges")
262:       .get() as { c: number };
263:     const kindRows = this.db
264:       .prepare("SELECT kind, count(*) AS c FROM edges GROUP BY kind ORDER BY kind")
265:       .all() as { kind: string; c: number }[];
266:     const edges_by_kind: Record<string, number> = {};
267:     for (const row of kindRows) {
268:       edges_by_kind[row.kind] = row.c;
269:     }
270:     return {
271:       memories: memCount.c,
272:       edges: edgeCount.c,
273:       edges_by_kind,
274:     };
275:   }
276: 
277:   /**
278:    * Run a write that may hit SQLITE_BUSY under concurrent WAL access.
279:    * Retries with a short delay until `BUSY_RETRIES` is exhausted.
280:    */
281:   run<T>(fn: () => T): T {
282:     let lastErr: unknown;
283:     for (let attempt = 0; attempt < BUSY_RETRIES; attempt++) {
284:       try {
285:         return fn();
286:       } catch (err) {
287:         if (
288:           err instanceof Error &&
289:           "errcode" in err &&
290:           (err as { errcode: number }).errcode === SQLITE_BUSY
291:         ) {
292:           lastErr = err;
293:           Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, BUSY_DELAY_MS);
294:           continue;
295:         }
296:         throw err;
297:       }
298:     }
299:     throw lastErr;
300:   }
301: }

(End of file - total 301 lines)
</content>
```

---

## Assistant (Build · euria-code · 0.9s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/bin/memory.js"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/bin/memory.js</path>
<type>file</type>
<content>
1: #!/usr/bin/env node
2: import { Store } from "../src/db.ts";
3: 
4: const HELP = `Usage: memory <command> [args] [flags]
5: 
6: Commands:
7:   store <content> [--metadata <json>]          Store a new memory, print its id
8:   update <id> [--content <text>] [--metadata <json>]   Update a memory
9:   delete <id>                                 Delete a memory (cascades edges)
10:   link <from-id> <to-id> --kind <kind> [--metadata <json>]  Create a typed edge
11:   search <query> [--where <sql>] [--limit N]  FTS5 search, ranked results as JSON
12:   get <id>                                    Print a memory as JSON (or "not found")
13:   list [--where <sql>] [--limit N] [--offset N]  List memories by metadata filter
14:   relations <id> [--direction out|in|both]    List edges to/from a memory
15:   stats                                       Print store statistics as JSON
16: 
17: Flags:
18:   --db <path>   Override the DB path (default: .ai-memory/memory.db)
19:   --help, -h    Show this help
20: 
21: Output:
22:   stdout: JSON results (one document per command)
23:   stderr: error messages
24:   exit:   0 on success, 1 on error
25: 
26: Notes:
27:   --metadata accepts a JSON string: '{"tags":["a"],"kind":"note"}'
28:   --where accepts a raw SQL fragment on the metadata JSON column using SQLite
29:     JSON operators, e.g.: metadata->>'$.kind' = 'note'
30: `;
31: 
32: function parseArgs(argv) {
33:   const args = [];
34:   const flags = {};
35:   for (let i = 0; i < argv.length; i++) {
36:     const a = argv[i];
37:     if (a === "--help" || a === "-h") {
38:       flags.help = true;
39:       continue;
40:     }
41:     if (a.startsWith("--")) {
42:       const key = a;
43:       const val = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[i + 1];
44:       if (!a.includes("=")) i++;
45:       flags[key] = val;
46:       continue;
47:     }
48:     args.push(a);
49:   }
50:   return { args, flags };
51: }
52: 
53: function parseMetadata(jsonStr) {
54:   if (!jsonStr) return undefined;
55:   try {
56:     return JSON.parse(jsonStr);
57:   } catch {
58:     fail(`invalid metadata JSON: ${jsonStr}`);
59:   }
60: }
61: 
62: function fail(msg) {
63:   process.stderr.write(`error: ${msg}\n`);
64:   process.exit(1);
65: }
66: 
67: function print(obj) {
68:   process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
69: }
70: 
71: function num(flag) {
72:   if (flag === undefined) return undefined;
73:   const n = Number(flag);
74:   if (!Number.isFinite(n)) fail(`expected a number, got: ${flag}`);
75:   return n;
76: }
77: 
78: function main() {
79:   const { args, flags } = parseArgs(process.argv.slice(2));
80: 
81:   if (flags.help || args.length === 0) {
82:     process.stdout.write(HELP);
83:     return;
84:   }
85: 
86:   const command = args[0];
87:   const rest = args.slice(1);
88: 
89:   const dbPath = flags["--db"];
90:   let store;
91:   try {
92:     store = Store.open(dbPath ? { dbPath } : {});
93:   } catch (err) {
94:     fail(`could not open store: ${err instanceof Error ? err.message : err}`);
95:   }
96: 
97:   try {
98:     switch (command) {
99:       case "store": {
100:         if (rest.length < 1) fail("store requires <content>");
101:         const content = rest[0];
102:         const metadata = parseMetadata(flags["--metadata"]);
103:         const id = store.store(content, metadata ? { metadata } : {});
104:         process.stdout.write(id + "\n");
105:         break;
106:       }
107:       case "update": {
108:         if (rest.length < 1) fail("update requires <id>");
109:         const id = rest[0];
110:         const content = flags["--content"];
111:         const metadata = parseMetadata(flags["--metadata"]);
112:         store.update(id, {
113:           ...(content !== undefined ? { content } : {}),
114:           ...(metadata !== undefined ? { metadata } : {}),
115:         });
116:         process.stdout.write("updated\n");
117:         break;
118:       }
119:       case "delete": {
120:         if (rest.length < 1) fail("delete requires <id>");
121:         store.delete(rest[0]);
122:         process.stdout.write("deleted\n");
123:         break;
124:       }
125:       case "link": {
126:         if (rest.length < 2) fail("link requires <from-id> <to-id>");
127:         const [fromId, toId] = rest;
128:         const kind = flags["--kind"];
129:         if (!kind) fail("link requires --kind <kind>");
130:         const metadata = parseMetadata(flags["--metadata"]);
131:         store.link(fromId, toId, kind, metadata ? { metadata } : {});
132:         process.stdout.write("linked\n");
133:         break;
134:       }
135:       case "search": {
136:         if (rest.length < 1) fail("search requires <query>");
137:         const query = rest.join(" ");
138:         const results = store.search(query, {
139:           ...(flags["--where"] ? { where: flags["--where"] } : {}),
140:           ...(flags["--limit"] ? { limit: num(flags["--limit"]) } : {}),
141:         });
142:         print(results);
143:         break;
144:       }
145:       case "get": {
146:         if (rest.length < 1) fail("get requires <id>");
147:         const mem = store.get(rest[0]);
148:         if (mem) {
149:           print(mem);
150:         } else {
151:           process.stderr.write(`not found: ${rest[0]}\n`);
152:           process.exitCode = 1;
153:         }
154:         break;
155:       }
156:       case "list": {
157:         const results = store.list({
158:           ...(flags["--where"] ? { where: flags["--where"] } : {}),
159:           ...(flags["--limit"] ? { limit: num(flags["--limit"]) } : {}),
160:           ...(flags["--offset"] ? { offset: num(flags["--offset"]) } : {}),
161:         });
162:         print(results);
163:         break;
164:       }
165:       case "relations": {
166:         if (rest.length < 1) fail("relations requires <id>");
167:         const direction = flags["--direction"];
168:         const results = store.relations(rest[0], {
169:           ...(direction ? { direction } : {}),
170:         });
171:         print(results);
172:         break;
173:       }
174:       case "stats": {
175:         print(store.stats());
176:         break;
177:       }
178:       default:
179:         fail(`unknown command: ${command}\n\n${HELP}`);
180:     }
181:   } catch (err) {
182:     fail(err instanceof Error ? err.message : String(err));
183:   } finally {
184:     store.close();
185:   }
186: }
187: 
188: main();

(End of file - total 188 lines)
</content>
```

**Tool: bash**

**Input:**
```json
{
  "command": "rtk ls /home/valentin/code/ai/ai-memory/.agents/skills/ | head -30"
}
```

**Output:**
```
ask-matt/
claude-handoff/
codebase-design/
code-review/
diagnosing-bugs/
domain-modeling/
git-guardrails-claude-code/
grilling/
grill-me/
grill-with-docs/
handoff/
implement/
implement-spec/
improve-codebase-architecture/
loop-me/
migrate-to-shoehorn/
prototype/
research/
resolving-merge-conflicts/
scaffold-exercises/
setup-matt-pocock-skills/
setup-pre-commit/
setup-ts-deep-modules/
tdd/
teach/
to-questionnaire/
to-spec/
to-tickets/
triage/
wait-what/

```

---

## Assistant (Build · euria-code · 5.4s)

_Thinking:_

Let me understand the state of the map. I'm in "Work through the map" mode. The map has been loaded. Let me orient:

**Destination**: An opencode skill (CLI via bash, Node + `node:sqlite`) that lets an agent store, retrieve, and search markdown memories in a per-project SQLite DB.

**Decisions so far** (4 resolved tickets):
1. Scaffold and schema - resolved
2. Write operations - resolved
3. Read operations - resolved
4. CLI entry and commands - resolved

**Open tickets**:
5. Skill authoring (SKILL.md) - Type: task, Status: open, Blocked by: 04 (which is resolved, so unblocked)
6. Integration test and gitignore - Type: task, Status: open, Blocked by: 04 (which is resolved, so unblocked)

Both tickets are unblocked (their blocker, ticket 04, is resolved). Neither is claimed. The frontier is both tickets 05 and 06.

The user hasn't specified a ticket, so I pick the first frontier ticket in order: **05 - Skill authoring (SKILL.md)**.

Wait, let me re-read the skill instructions. The user hasn't specified a ticket. The skill says:
> Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.

So I should claim ticket 05 first. But wait - the skill also says this is "Work through the map" mode. Let me also check - this map has execution carried into it via the Notes: "Skills every session should consult: `implement` or `implement-spec` for the build tickets". So this is a map that overrides the default planning mode.

Now, ticket 05 is a `task` type. The skill says:
> **Task** (HITL or AFK): Manual work that must happen before a _decision_ can be made... The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts...

Since the user hasn't specified a ticket, I should pick the first frontier ticket. Let me verify both 05 and 06 are unblocked - they're both blocked by 04, which is resolved. So both are on the frontier.

First by number is 05 - Skill authoring.

But wait - the skill says "never resolve more than one ticket per session, with the exception of research tickets." So I work on one ticket this session.

Let me claim ticket 05 and work on it. It's a task type, and the agent can drive it alone (AFK) since it's just authoring a SKILL.md file following conventions of existing skills.

Actually, let me re-read. The user message was just the skill prompt. Let me check if there's a specific invocation. The user message contains the wayfinder skill content and references `../.scratch/ai-memory-skill/map.md`. This looks like a "Work through the map" invocation.

Let me proceed:
1. Load the map (done)
2. Choose the ticket: first frontier ticket = 05 - Skill authoring
3. Claim it
4. Resolve it
5. Record the resolution

Let me first look at a few existing skills to understand the conventions for SKILL.md.

I'm in **Work through the map** mode. The map has 4 resolved tickets (01-04). The frontier has two open, unblocked tickets: **05 - Skill authoring** and **06 - Integration test**. Both are blocked only by 04 (resolved). I'll take the first: **05 - Skill authoring**.

Let me claim it and study the existing skill conventions.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/05-skill-authoring.md",
  "oldString": "Type: task\nStatus: open\nBlocked by: 04",
  "newString": "Type: task\nStatus: claimed\nBlocked by: 04"
}
```

**Output:**
```
Edit applied successfully.
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/implement/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/implement/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: implement
3: description: "Implement a piece of work based on a spec or set of tickets."
4: disable-model-invocation: true
5: ---
6: 
7: Implement the work described by the user in the spec or tickets.
8: 
9: Use /tdd where possible, at pre-agreed seams.
10: 
11: Run typechecking regularly, single test files regularly, and the full test suite once at the end.
12: 
13: Once done, use /code-review to review the work.
14: 
15: Commit your work to the current branch.

(End of file - total 15 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/handoff/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/handoff/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: handoff
3: description: Compact the current conversation into a handoff document for another agent to pick up.
4: argument-hint: "What will the next session be used for?"
5: disable-model-invocation: true
6: ---
7: 
8: Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.
9: 
10: Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.
11: 
12: Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.
13: 
14: Redact any sensitive information, such as API keys, passwords, or personally identifiable information.
15: 
16: If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

(End of file - total 16 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/prototype/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/prototype/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: prototype
3: description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
4: ---
5: 
6: # Prototype
7: 
8: A prototype is **throwaway code that answers a question**. The question decides the shape.
9: 
10: ## Pick a branch
11: 
12: Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:
13: 
14: - **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
15: - **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.
16: 
17: The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.
18: 
19: ## Rules that apply to both
20: 
21: 1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious, but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
22: 2. **Trivial to run.** A UI prototype starts from one command in the project's task runner: `pnpm <name>`, `python <path>`, `bun <path>`, etc. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
23: 3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name.
24: 4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
25: 5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
26: 6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too (the verdict and the question it settled) in the issue or a commit. The main branch keeps only the validated decision.

(End of file - total 26 lines)
</content>
```

---

## Assistant (Build · euria-code · 1.0s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/research/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/research/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: research
3: description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
4: ---
5: 
6: Spin up a **background agent** to do the research, so you keep working while it reads.
7: 
8: Its job:
9: 
10: 1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
11: 2. Write the findings to a single Markdown file, citing each claim's source.
12: 3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.

(End of file - total 12 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/diagnosing-bugs/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/diagnosing-bugs/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: diagnosing-bugs
3: description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
4: ---
5: 
6: # Diagnosing Bugs
7: 
8: A discipline for hard bugs. Skip phases only when explicitly justified.
9: 
10: When exploring the codebase, read `CONTEXT.md` (if it exists) to get a clear mental model of the relevant modules, and check ADRs in the area you're touching.
11: 
12: ## Redact
13: 
14: This skill has you show commands, outputs and captured artifacts. **Redact every secret first**: write `<REDACTED>` in its place. Build loops against env vars, so the credential stays in the environment rather than in what you show. Captured artifacts carry auth headers: quote only the lines that carry the signal.
15: 
16: If the redacted output is not enough to diagnose the bug, say so and ask the user.
17: 
18: ## Phase 1: Build a feedback loop
19: 
20: **This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal for the bug (one that goes red on _this_ bug), you will find the cause; bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.
21: 
22: Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**
23: 
24: ### Ways to construct one, in roughly this order
25: 
26: 1. **Failing test** at whatever seam reaches the bug: unit, integration, e2e.
27: 2. **Curl / HTTP script** against a running dev server.
28: 3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
29: 4. **Headless browser script** (Playwright / Puppeteer) that drives the UI and asserts on DOM/console/network.
30: 5. **Replay a captured trace.** Save a real network request / payload / event log to disk; replay it through the code path in isolation.
31: 6. **Throwaway harness.** Spin up a minimal subset of the system (one service, mocked deps) that exercises the bug code path with a single function call.
32: 7. **Property / fuzz loop.** If the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
33: 8. **Bisection harness.** If the bug appeared between two known states (commit, dataset, version), automate "boot at state X, check, repeat" so you can `git bisect run` it.
34: 9. **Differential loop.** Run the same input through old-version vs new-version (or two configs) and diff outputs.
35: 10. **HITL bash script.** Last resort. If a human must click, drive _them_ with `scripts/hitl-loop.template.sh` so the loop is still structured. Captured output feeds back to you.
36: 
37: Build the right feedback loop, and the bug is 90% fixed.
38: 
39: ### Tighten the loop
40: 
41: Treat the loop as a product. Once you have _a_ loop, **tighten** it:
42: 
43: - Can I make it faster? (Cache setup, skip unrelated init, narrow the test scope.)
44: - Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash".)
45: - Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)
46: 
47: A 30-second flaky loop is barely better than no loop; a 2-second deterministic one is tight, a debugging superpower.
48: 
49: ### Non-deterministic bugs
50: 
51: The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not, so keep raising the rate until it's debuggable.
52: 
53: ### When you genuinely cannot build a loop
54: 
55: Stop and say so explicitly. List what you tried. Ask the user for: (a) access to whatever environment reproduces it, (b) a redacted captured artifact (HAR file, log dump, core dump, screen recording with timestamps), or (c) permission to add temporary production instrumentation. Do **not** proceed to hypothesise without a loop.
56: 
57: ### Completion criterion: a tight loop that goes red
58: 
59: Phase 1 is done when the loop is **tight** and **red-capable**: you can name **one command** (a script path, a test invocation, a curl) that you have **already run at least once** (show the invocation and its output, redacted), and that is:
60: 
61: - [ ] **Red-capable**: it drives the actual bug code path and asserts the **user's exact symptom**, so it can go red on this bug and green once fixed. Not "runs without erroring"; it must be able to _catch this specific bug_.
62: - [ ] **Deterministic**: same verdict every run (flaky bugs: a pinned, high reproduction rate, per above).
63: - [ ] **Fast**: seconds, not minutes.
64: - [ ] **Agent-runnable**: you can run it unattended; a human in the loop only via `scripts/hitl-loop.template.sh`.
65: 
66: If you catch yourself reading code to build a theory before this command exists, **stop: jumping straight to a hypothesis is the exact failure this skill prevents.** No red-capable command, no Phase 2.
67: 
68: ## Phase 2: Reproduce + minimise
69: 
70: Run the loop. Watch it go red as the bug appears.
71: 
72: Confirm:
73: 
74: - [ ] The loop produces the failure mode the **user** described, not a different failure that happens to be nearby. Wrong bug = wrong fix.
75: - [ ] The failure is reproducible across multiple runs (or, for non-deterministic bugs, reproducible at a high enough rate to debug against).
76: - [ ] You have captured the exact symptom (error message, wrong output, slow timing) so later phases can verify the fix actually addresses it.
77: 
78: ### Minimise
79: 
80: Once it's red, shrink the repro to the **smallest scenario that still goes red**. Cut inputs, callers, config, data, and steps **one at a time**, re-running the loop after each cut, and keep only what's load-bearing for the failure.
81: 
82: Why bother: a minimal repro shrinks the hypothesis space in Phase 3 (fewer moving parts left to suspect) and becomes the clean regression test in Phase 5.
83: 
84: Done when **every remaining element is load-bearing**: removing any one of them makes the loop go green.
85: 
86: Do not proceed until you have reproduced **and** minimised.
87: 
88: ## Phase 3: Hypothesise
89: 
90: Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.
91: 
92: Each hypothesis must be **falsifiable**: state the prediction it makes.
93: 
94: > Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."
95: 
96: If you cannot state the prediction, the hypothesis is a vibe: discard or sharpen it.
97: 
98: **Show the ranked list to the user before testing.** They often have domain knowledge that re-ranks instantly ("we just deployed a change to #3"), or know hypotheses they've already ruled out. Cheap checkpoint, big time saver. Don't block on it; proceed with your ranking if the user is AFK.
99: 
100: ## Phase 4: Instrument
101: 
102: Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**
103: 
104: Tool preference:
105: 
106: 1. **Debugger / REPL inspection** if the env supports it. One breakpoint beats ten logs.
107: 2. **Targeted logs** at the boundaries that distinguish hypotheses.
108: 3. Never "log everything and grep".
109: 
110: **Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup at the end becomes a single grep. Untagged logs survive; tagged logs die.
111: 
112: **Perf branch.** For performance regressions, logs are usually wrong. Instead: establish a baseline measurement (timing harness, `performance.now()`, profiler, query plan), then bisect. Measure first, fix second.
113: 
114: ## Phase 5: Fix + regression test
115: 
116: Write the regression test **before the fix**, but only if there is a **correct seam** for it.
117: 
118: A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow (single-caller test when the bug needs multiple callers, unit test that can't replicate the chain that triggered the bug), a regression test there gives false confidence.
119: 
120: **If no correct seam exists, that itself is the finding.** Note it. The codebase architecture is preventing the bug from being locked down. Flag this for the next phase.
121: 
122: If a correct seam exists:
123: 
124: 1. Turn the minimised repro into a failing test at that seam.
125: 2. Watch it fail.
126: 3. Apply the fix.
127: 4. Watch it pass.
128: 5. Re-run the Phase 1 feedback loop against the original (un-minimised) scenario.
129: 
130: ## Phase 6: Cleanup
131: 
132: Required before declaring done:
133: 
134: - [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
135: - [ ] Regression test passes (or absence of seam is documented)
136: - [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
137: - [ ] Throwaway prototypes deleted (or moved to a clearly-marked debug location)
138: - [ ] The hypothesis that turned out correct is stated in the commit / PR message, so the next debugger learns

(End of file - total 138 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/tdd/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/tdd/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: tdd
3: description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
4: ---
5: 
6: # Test-Driven Development
7: 
8: TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.
9: 
10: When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.
11: 
12: ## What a good test is
13: 
14: Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.
15: 
16: See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.
17: 
18: ## Seams: where tests go
19: 
20: A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.
21: 
22: **Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.
23: 
24: Ask: "What's the public interface, and which seams should we test?"
25: 
26: When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.
27: 
28: ## Anti-patterns
29: 
30: - **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
31: - **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
32: - **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.
33: 
34: ## Rules of the loop
35: 
36: - **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
37: - **One slice at a time.** One seam, one test, one minimal implementation per cycle.
38: - **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.

(End of file - total 38 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/domain-modeling/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/domain-modeling/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: domain-modeling
3: description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR.
4: ---
5: 
6: # Domain Modeling
7: 
8: Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)
9: 
10: ## File structure
11: 
12: Most repos have a single context:
13: 
14: ```
15: /
16: ├── CONTEXT.md
17: ├── docs/
18: │   └── adr/
19: │       ├── 0001-event-sourced-orders.md
20: │       └── 0002-postgres-for-write-model.md
21: └── src/
22: ```
23: 
24: If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:
25: 
26: ```
27: /
28: ├── CONTEXT-MAP.md
29: ├── docs/
30: │   └── adr/                          ← system-wide decisions
31: ├── src/
32: │   ├── ordering/
33: │   │   ├── CONTEXT.md
34: │   │   └── docs/adr/                 ← context-specific decisions
35: │   └── billing/
36: │       ├── CONTEXT.md
37: │       └── docs/adr/
38: ```
39: 
40: Create files lazily: only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.
41: 
42: ## During the session
43: 
44: ### Challenge against the glossary
45: 
46: When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"
47: 
48: ### Sharpen fuzzy language
49: 
50: When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."
51: 
52: ### Discuss concrete scenarios
53: 
54: When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.
55: 
56: ### Cross-reference with code
57: 
58: When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"
59: 
60: ### Update CONTEXT.md inline
61: 
62: When a term is resolved, update `CONTEXT.md` right there. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).
63: 
64: `CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.
65: 
66: ### Offer ADRs sparingly
67: 
68: Only offer to create an ADR when all three are true:
69: 
70: 1. **Hard to reverse**: the cost of changing your mind later is meaningful
71: 2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
72: 3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons
73: 
74: If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

(End of file - total 74 lines)
</content>
```

---

## Assistant (Build · euria-code · 1.6s)

_Thinking:_

Now I have a good understanding of the skill conventions. Let me look at a few more skills to understand the frontmatter format and body structure, then I'll author the SKILL.md.

Let me look at the ADR that's referenced in the map and the existing structure of the `../.agents/skills` directory more carefully.

Now let me look at the ADR and a couple more neighbor skills to understand the exact conventions.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/docs/adr"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/docs/adr</path>
<type>directory</type>
<entries>
0001-labeled-property-graph-over-triple-store.md

(1 entries)
</entries>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/teach/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/teach/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: teach
3: description: Teach the user a new skill or concept, within this workspace.
4: disable-model-invocation: true
5: argument-hint: "What would you like to learn about?"
6: ---
7: 
8: The user has asked you to teach them something. This is a stateful request - they intend to learn the topic over multiple sessions.
9: 
10: ## Teaching Workspace
11: 
12: Treat the current directory as a teaching workspace. The state of their learning is captured in this directory in several files:
13: 
14: - `MISSION.md`: A document capturing the _reason_ the user is interested in the topic. This should be used to ground all teaching. Use the format in [MISSION-FORMAT.md](./MISSION-FORMAT.md).
15: - `./reference/*.html`: A directory of reference materials. These are the compressed learnings from the lessons - cheat sheets, reference algorithms, syntax, yoga poses, glossaries. They are the raw units of learning. They should be beautiful documents which print out well, and are designed for quick reference.
16: - `RESOURCES.md`: A list of resources which can be explored to ground your teaching in contextual knowledge, or to acquire knowledge and wisdom. Use the format in [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
17: - `./learning-records/*.md`: A directory of learning records, which capture what the user has learned. These are loosely equivalent to architectural decision records in software development - they capture non-obvious lessons and key insights that may need to be revised later, or drive future sessions. These should be used to calculate the zone of proximal development. They are titled `0001-<dash-case-name>.md`, where the number increments each time. Use the format in [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
18: - `./lessons/*.html`: A directory of lessons. A **lesson** is a single, self-contained HTML output that teaches one tightly-scoped thing tied to the mission. This is the primary unit of teaching in this workspace.
19: - `./assets/*`: Reusable **components** shared across lessons. See [Assets](#assets).
20: - `NOTES.md`: A scratchpad for you to jot down user preferences, or working notes.
21: 
22: ## Philosophy
23: 
24: To learn at a deep level, the user needs three things:
25: 
26: - **Knowledge**, captured from high-quality, high-trust resources
27: - **Skills**, acquired through highly-relevant interactive lessons devised by you, based on the knowledge
28: - **Wisdom**, which comes from interacting with other learners and practitioners
29: 
30: Before the `RESOURCES.md` is well-populated, your focus should be to find high-quality resources which will help the user acquire knowledge. Never trust your parametric knowledge.
31: 
32: Some topics may require more skills than knowledge. Learning more about theoretical physics might be more knowledge-based. For yoga, more skills-based.
33: 
34: ### Fluency vs Storage Strength
35: 
36: You should be careful to split between two types of learning:
37: 
38: - **Fluency strength**: in-the-moment retrieval of knowledge
39: - **Storage strength**: long-term retention of knowledge
40: 
41: Fluency can give the user an illusory sense of mastery, but storage strength is the real goal. Try to design lessons which build long-term retention by desirable difficulty:
42: 
43: - Using retrieval practice (recall from memory)
44: - Spacing (distributing practice over time)
45: - Interleaving (mixing up different but related topics in practice - for skills practice only)
46: 
47: ## Lessons
48: 
49: A lesson is the main thing you produce: the unit in which knowledge and skills reach the user. Each lesson is one self-contained HTML file, saved to `./lessons/` and titled `0001-<dash-case-name>.html` where the number increments each time.
50: 
51: A lesson should be **beautiful**, with clean, readable typography and layout, since the user will return to these later to review. Think Tufte.
52: 
53: The lesson should be short, and completable very quickly. Learners' working memory is very small, and we need to stay within it. But each lesson should give the user a single tangible win that they can build on. It should be directly tied to the mission, and should be in the user's zone of proximal development.
54: 
55: If possible, open the lesson file for the user by running a CLI command.
56: 
57: Each lesson should link via HTML anchors to other lessons and reference documents.
58: 
59: Each lesson should recommend a primary source for the user to read or watch. This should be the most high-quality, high-trust resource you found on the topic.
60: 
61: Each lesson should contain a reminder to ask followup questions to the agent. The agent is their teacher, and can assist with anything that's unclear.
62: 
63: ## Assets
64: 
65: Lessons are built from reusable **components**, stored in `./assets/`: stylesheets, quiz widgets, simulators, diagram helpers, and anything else a second lesson could reuse.
66: 
67: Reuse is the default, not the exception. Before authoring a lesson, read `./assets/` and build from the components already there. When a lesson needs something new and reusable, write it as a component in `./assets/` and link to it; never inline code a future lesson would duplicate.
68: 
69: A shared stylesheet is the first component every workspace earns: every lesson links it, so the lessons look like one consistent course rather than a pile of one-offs. As the workspace grows, so should the component library.
70: 
71: ## The Mission
72: 
73: Every lesson should be tied into the mission - the reason that the user is interested in learning about the topic.
74: 
75: If the user is unclear about the mission, or the `MISSION.md` is not populated, your first job should be to question the user on why they want to learn this.
76: 
77: Failing to understand the mission will mean knowledge acquisition is not grounded in real-world goals. Lessons will feel too abstract. You will have no way of judging what the user should do next.
78: 
79: Missions may change as the user develops more skills and knowledge. This is normal - make sure to update the `MISSION.md` and add a learning record to capture the change. Confirm with the user before changing the mission.
80: 
81: ## Zone Of Proximal Development
82: 
83: Each lesson, the user should always feel as if they are being challenged 'just enough'.
84: 
85: The user may specify an exact thing they want to learn. If they don't, figure out their zone of proximal development by:
86: 
87: - Reading their `learning-records`
88: - Figuring out the right thing to teach them based on their mission
89: - Teach the most relevant thing that fits in their zone of proximal development
90: 
91: ## Knowledge
92: 
93: Lessons should be designed around a skill the user is going to learn. The knowledge in the lesson should be only what's required to acquire that skill. You teach the knowledge first, then get the user to practice the skills via an interactive feedback loop.
94: 
95: Knowledge should first be gathered from trusted resources. Use `RESOURCES.md` to keep track of them. Lessons should be littered with citations - links to external resources to back up any claim made. This increases the trustworthiness of the lesson.
96: 
97: For acquiring knowledge, difficulty is the enemy. It eats working memory you need for understanding.
98: 
99: ## Skills
100: 
101: If knowledge is all about acquisition, skills are about durability and flexibility. Make the knowledge stick.
102: 
103: For skill acquisition, difficulty is the tool. Effortful retrieval is what builds storage strength. Skills should be taught through interactive lessons. There are several tools at your disposal:
104: 
105: - Interactive lessons, using quizzes and light in-browser tasks
106: - Lessons which guide the user through a list of real-world steps to take (for instance, yoga poses)
107: 
108: Each of these should be based on a **feedback loop**, where the user receives feedback on their performance. This feedback loop should be as tight as possible, giving feedback immediately - and ideally automatically.
109: 
110: For quizzes, each answer should be exactly the same number of words (and characters, if possible). Don't give the user any clues about the answer through formatting.
111: 
112: ## Acquiring Wisdom
113: 
114: Wisdom comes from true real-world interaction - testing your skills outside the learning environment.
115: 
116: When the user asks a question that appears to require wisdom, your default posture should be to attempt to answer - but to ultimately delegate to a **community**.
117: 
118: A community is a place (online or offline) where the user can test their skills in the real world. This might be a forum, a subreddit, a real-world class (budget permitting) or a local interest group.
119: 
120: You should attempt to find high-reputation communities the user can join. If the user expresses a preference that they don't want to join a community, respect it.
121: 
122: ## Reference Documents
123: 
124: While creating lessons, you should also create reference documents. Lessons can reference these documents - they are useful for tracking raw units of knowledge useful across lessons.
125: 
126: Lessons will rarely be revisited later - reference documents will be. They should be the compressed essence of the lesson, in a format designed for quick reference.
127: 
128: Some learning topics lend themselves to reference:
129: 
130: - Syntax and code snippets for programming
131: - Algorithms and flowcharts for processes
132: - Yoga poses and sequences for yoga
133: - Exercises and routines for fitness
134: - Glossaries for any topic with its own nomenclature
135: 
136: Glossaries, in particular, are an essential reference. Once one is created, it should be adhered to in every lesson.
137: 
138: ## `NOTES.md`
139: 
140: The user will sometimes express preferences of how they want to be taught, or things you should keep in mind. This is the place to record those preferences, so you can refer back to them when designing lessons or working with the user.

(End of file - total 140 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/code-review/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/code-review/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: code-review
3: description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
4: ---
5: 
6: Two-axis review of the diff between `HEAD` and a fixed point the user supplies:
7: 
8: - **Standards**: does the code conform to this repo's documented coding standards?
9: - **Spec**: does the code faithfully implement the originating issue / spec?
10: 
11: Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.
12: 
13: The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`.
14: 
15: ## Process
16: 
17: ### 1. Pin the fixed point
18: 
19: Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.
20: 
21: Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.
22: 
23: Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.
24: 
25: ### 2. Identify the spec source
26: 
27: Look for the originating spec, in this order:
28: 
29: 1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `docs/agents/issue-tracker.md`.
30: 2. A path the user passed as an argument.
31: 3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
32: 4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".
33: 
34: ### 3. Identify the standards sources
35: 
36: Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.
37: 
38: On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:
39: 
40: - **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
41: - **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.
42: 
43: Each smell reads *what it is* → *how to fix*; match it against the diff:
44: 
45: - **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
46: - **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
47: - **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
48: - **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
49: - **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
50: - **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
51: - **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
52: - **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
53: - **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
54: - **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
55: - **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
56: - **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.
57: 
58: ### 4. Spawn both sub-agents in parallel
59: 
60: **Standards sub-agent prompt** should include:
61: 
62: - The full diff command and commit list.
63: - The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
64: - The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."
65: 
66: **Spec sub-agent prompt** should include:
67: 
68: - The diff command and commit list.
69: - The path or fetched contents of the spec.
70: - The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."
71: 
72: If the spec is missing, skip the Spec sub-agent and note this in the final report.
73: 
74: ### 5. Aggregate
75: 
76: Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).
77: 
78: End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.
79: 
80: ## Why two axes
81: 
82: A change can pass one axis and fail the other:
83: 
84: - Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
85: - Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**
86: 
87: Reporting them separately stops one axis from masking the other.

(End of file - total 87 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/wayfinder/SKILL.md",
  "offset": 60
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/wayfinder/SKILL.md</path>
<type>file</type>
<content>
60: ## Question
61: 
62: <the decision or investigation this ticket resolves>
63: ```
64: 
65: Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).
66: 
67: A session **claims** a ticket by assigning it to the dev driving the map, **first**, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed.
68: 
69: Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.
70: 
71: The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.
72: 
73: ## Ticket Types
74: 
75: Every ticket is either **HITL** (human in the loop, worked _with_ a human who speaks for themselves) or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).
76: 
77: - **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that calls the Skill tool with "research". Use when knowledge outside the current working directory is required.
78: - **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
79: - **Grilling** (HITL): Conversation. The default case. Always call the Skill tool twice, for "grilling" and "domain-modeling".
80: - **Task** (HITL or AFK): Manual work that must happen before a _decision_ can be made: nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that _does_ rather than decides, and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.
81: 
82: ## Fog of war
83: 
84: The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war**: the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets, one at a time, until the way to the destination is clear and no tickets remain.
85: 
86: The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination: everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.
87: 
88: **Fog or ticket?** The test is whether you can state the question precisely now, _not_ whether you can answer it now.
89: 
90: - **Ticket when** the question is already sharp, even if it's blocked and you can't act on it yet.
91: - **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.
92: 
93: **Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).
94: 
95: ## Out of scope
96: 
97: Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope**: it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.
98: 
99: Out-of-scope work never graduates (the frontier stops at the destination), so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.
100: 
101: Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
102: 
103: ## Invocation
104: 
105: Two modes. Either way, **never resolve more than one ticket per session**, with the exception of research tickets.
106: 
107: ### Chart the map
108: 
109: User invokes with a loose idea.
110: 
111: 1. **Name the destination.** Call the Skill tool twice, for "grilling" and "domain-modeling", to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
112: 2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** (the way to the destination is already clear, the whole journey small enough for one session), you don't need a map. Stop and ask the user how they'd like to proceed.
113: 3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
114: 4. **Create the tickets you can specify now** as child issues of the map, then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog: the **Not yet specified** section.
115: 5. **Fire the research subagents.** For each `research` ticket you just created, spin up a subagent that calls the Skill tool with "research" to resolve it in parallel, capturing its findings on a throwaway `research/<name>` branch with a context pointer from the ticket.
116: 6. Stop: charting is one session's work; it hand-resolves nothing.
117: 
118: ### Work through the map
119: 
120: User invokes with a map (URL or number). A ticket is **optional**: without one, you pick the next decision, not the user.
121: 
122: 1. Load the **map**: the low-res view, not every ticket body.
123: 2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.
124: 3. Resolve it. **Zoom as needed**: fetch the full body of any related or closed ticket on demand; call the Skill tool for whichever skills the `## Notes` block names. If in doubt, call the Skill tool twice, for "grilling" and "domain-modeling".
125: 4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
126: 5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
127: 
128: The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.

(End of file - total 128 lines)
</content>
```

---

## Assistant (Build · euria-code · 6.4s)

_Thinking:_

Now I have a clear picture. Let me understand the state:

1. Map is at `../.scratch/ai-memory-skill/map.md`
2. Tickets 01-04 are resolved (scaffold, writes, reads, CLI)
3. Tickets 05 and 06 are open, both blocked only by 04 (now resolved), so both are on the frontier
4. I've claimed ticket 05 (Skill authoring)
5. The ticket is a `task` type - I need to author the SKILL.md for the ai-memory skill

The ticket asks me to:
1. Create `../.agents/skills/ai-memory/SKILL.md` following neighbor skill conventions
2. Document the memory-link convention
3. Don't duplicate CLI reference or domain glossary - link to them
4. Document the exploration pattern (frontier loop)

Let me look at the skill conventions. I've read several SKILL.md files. Let me look at the frontmatter format they use:

```yaml
---
name: <skill-name>
description: <description>
disable-model-invocation: true  # or not present, or argument-hint
---
```

Then the body is markdown with the skill instructions.

The ticket says:
- Description: when to use this skill (storing, retrieving, searching memories during a session)
- Invocation: the CLI commands (reference `../bin/memory.js`), with one-line examples
- Domain vocabulary: point to `../CONTEXT.md` for terms
- Exploration pattern: document the frontier loop — search by keyword → read matches → traverse relations → repeat with `LIMIT`

Let me also read the ADR to understand the graph decision, and look at a couple more skills for shape.

Actually, I've got enough. Let me now author the SKILL.md. The ticket says to follow the conventions of existing skills. Let me look at what I know:

The skills have:
- Frontmatter with `name`, `description`, and optionally `disable-model-invocation: true` or `argument-hint`
- The body is markdown instructions

For the ai-memory skill, I want:
- `name: ai-memory`
- `description`: when to use this skill
- The body: invocation instructions, domain vocabulary pointer, exploration pattern

Let me look at the CLI help text again for the command reference, and the CONTEXT.md for the domain terms.

From `../bin/memory.js` HELP:
```
Commands:
  store <content> [--metadata <json>]          Store a new memory, print its id
  update <id> [--content <text>] [--metadata <json>]   Update a memory
  delete <id>                                 Delete a memory (cascades edges)
  link <from-id> <to-id> --kind <kind> [--metadata <json>]  Create a typed edge
  search <query> [--where <sql>] [--limit N]  FTS5 search, ranked results as JSON
  get <id>                                    Print a memory as JSON (or "not found")
  list [--where <sql>] [--limit N] [--offset N]  List memories by metadata filter
  relations <id> [--direction out|in|both]    List edges to/from a memory
  stats                                       Print store statistics as JSON

Flags:
  --db <path>   Override the DB path (default: .ai-memory/memory.db)
  --help, -h    Show this help

Output:
  stdout: JSON results (one document per command)
  stderr: error messages
  exit:   0 on success, 1 on error
```

From the CLI answer in ticket 04:
- `store` prints bare id (one line)
- `update`/`delete`/`link` print one-word confirmation
- `search`, `get`, `list`, `relations`, `stats` print pretty JSON
- `get` on unknown id: stderr `not found: <id>`, exit 1
- `--metadata` takes a JSON string
- `--where` takes a raw SQL fragment on the metadata JSON column

From CONTEXT.md, the domain terms are: Memory, Content, Metadata, Relation, Kind, Memory link, Search, Frontier, Store.

The exploration pattern (Frontier) from CONTEXT.md:
"The thread an agent follows through a large memory it cannot fit in context: search by keyword (small ranked results) → read matches → traverse relations to related memories → repeat, with `LIMIT` at every step. Never loads the whole DB."

Now let me think about the SKILL.md structure. Looking at neighbor skills:
- Some have `disable-model-invocation: true` (implement, handoff, teach, wayfinder)
- Some don't (prototype, research, diagnosing-bugs, tdd, domain-modeling, code-review)

The `disable-model-invocation: true` seems to be for skills that are meant to be user-invoked explicitly (via `/skill-name`), not auto-invoked by the model. For ai-memory, since it's a tool the agent should reach for when it needs to store/retrieve/search memories, it should probably be auto-invocable (the model can decide to use it). So I'll omit `disable-model-invocation`.

Actually wait, let me reconsider. The ai-memory skill is about using the memory CLI. The agent should know when to use it. If `disable-model-invocation: true` is set, the model won't auto-invoke it; the user has to say `/ai-memory`. If it's not set, the model can auto-invoke it when it thinks it's relevant.

For a memory skill, the agent should be able to auto-invoke it when it needs to store or retrieve memories. So I'll omit `disable-model-invocation`.

Let me now create the SKILL.md. I need to:
1. Check if `../.agents/skills/ai-memory` directory exists
2. Create SKILL.md there

Let me check the directory structure first.

Now I have a clear picture of the task. Let me check if the target directory exists and look at the ADR for completeness.

**Tool: bash**

**Input:**
```json
{
  "command": "rtk ls -la /home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/ 2>/dev/null; echo \"---\"; rtk read /home/valentin/code/ai/ai-memory/docs/adr/0001-labeled-property-graph-over-triple-store.md"
}
```

**Output:**
```
---
# Labeled-property graph over triple-store

We use a labeled-property graph: the node is a whole memory (a markdown document), attributes live in a `metadata` JSON column, and typed directed edges connect memories. We rejected the triple-store / RDF model (subject-predicate-object triples, every attribute a node) because it atomizes content into one-word nodes, defeats FTS5 full-text search, and leaves the markdown prose with no natural home.

```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/grill-me/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/grill-me/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: grill-me
3: description: A relentless interview to sharpen a plan or design.
4: disable-model-invocation: true
5: ---
6: 
7: Call the Skill tool with "grilling".

(End of file - total 7 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/loop-me/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/loop-me/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: loop-me
3: description: Grill me about specs for the workflows I want to build, within this workspace.
4: disable-model-invocation: true
5: argument-hint: "A workflow to design, or nothing to go find one"
6: ---
7: 
8: Run a stateful `/grilling` session whose only output is **workflow** specs. Use the grilling discipline (relentless, a round of questions at a time, a recommended answer attached to each) aimed at the vocabulary and goal below. Create, edit, and delete specs as the grilling resolves things.
9: 
10: ## The loop lens
11: 
12: A **loop** is a recurring pattern in the user's life: their career, their week, their morning, a single repeated activity. Picturing a life as loops within loops reveals how predictable its activities really are, which is what makes them worth **delegating**. Use the lens to find loops worth specifying, and propose ones the user hasn't noticed.
13: 
14: A **workflow** is the spec of one loop, made real. You run a workflow on a loop: the loop is its running instantiation. Workflows live in `workflows/*.md` and are the source of truth.
15: 
16: ## Vocabulary
17: 
18: A shared language, reached for only when a workflow calls for it: never a checklist. **Mandate nothing structural**: a workflow needs no AI, no checkpoint, and no schedule unless the grilling shows it does.
19: 
20: - **Trigger**: what fires each run, an **event** (a new email, a new issue) or a **schedule** (every morning). Event-triggering is usually the more efficient.
21: - **Checkpoint**: a human-in-the-loop point where the user is asked to verify or decide. Some workflows have none and run autonomously; some use no AI at all.
22: - **Push right**: defer the checkpoint as far as it will go. Do maximal work before involving the human, so they are asked once, late, with everything prepared.
23: - **Brief**: what a checkpoint presents, a tight, decision-ready summary (what was produced, why, and a link down to the asset itself), never the raw output. The user reads a brief, not a draft. Speed of review is imperative.
24: 
25: ## Definition of done
26: 
27: A workflow spec is done when an implementer agent could build it without asking a single question. Grill until then; nothing is done while a question remains.
28: 
29: ## The workspace
30: 
31: - `workflows/*.md`: one spec per workflow.
32: - `NOTES.md`: raw notes on the user's world, the tools they use, the channels they process, and their own terminology for both. When it is empty or thin, interview them about their world before specifying anything. Sharpen fuzzy terms into canonical ones as they surface, and record them here.

(End of file - total 32 lines)
</content>
```

---

## Assistant (Build · euria-code · 15.1s)

_Thinking:_

Now I have a very clear picture. Let me summarize what I know:

1. **Ticket 05 - Skill authoring** is claimed. It's a `task` type ticket.
2. The task is to author `SKILL.md` at `../.agents/skills/ai-memory` so an agent knows when and how to use the memory system.
3. The ticket says to read 2-3 neighbor skills for the shape. I've read several already.

Let me analyze the conventions of existing SKILL.md files:

**Frontmatter format:**
```yaml
---
name: <skill-name>
description: <when to use this skill>
[disable-model-invocation: true]  # optional
[argument-hint: "..."]  # optional
---
```

**Structure varies but common elements:**
- Short intro paragraph describing what the skill does
- Sections with `##` headers
- Some have references to other files with relative paths

Now let me look at the specific ticket requirements:

1. **SKILL.md** at `../.agents/skills/ai-memory/SKILL.md`:
   - **Description**: when to use this skill (storing, retrieving, searching memories during a session)
   - **Invocation**: the CLI commands (reference `../bin/memory.js`), with one-line examples
   - **Domain vocabulary**: point to `../CONTEXT.md` for terms
   - **Exploration pattern**: document the frontier loop — search → read → traverse relations → repeat with LIMIT

2. **Memory-link convention**: document the `memory://<id>` scheme and that `get` resolves these. External links are just text, not graph edges.

3. **Do not** duplicate the CLI reference or domain glossary; link to them. The skill is the thin contract.

**Acceptance**: a fresh agent reading SKILL.md knows what the skill does, when to reach for it, how to call each command, and how to explore a large memory. Matches the tone and structure of neighbor skills.

This is a `task` ticket (AFK-able). The ticket is clear — no decisions to make, just authoring work. Let me create the SKILL.md.

Let me think about what the SKILL.md should contain based on:
- The CLI commands from `../bin/memory.js`
- The domain vocabulary from `../CONTEXT.md`
- The exploration pattern from the CONTEXT.md "Frontier" definition
- The memory-link convention

Key conventions I see in existing skills:
1. Frontmatter with `name`, `description`, optionally `disable-model-invocation: true` and `argument-hint`
2. Some skills have `disable-model-invocation: true` (implement, handoff, grill-me, wayfinder, teach) and some don't (prototype, research, diagnosing-bugs, tdd, domain-modeling, code-review)
3. The `disable-model-invocation: true` seems to be on skills that are explicitly invoked by the user via slash commands, while skills without it can be invoked by the model automatically based on the description.

Since this is an ai-memory skill that an agent should use during sessions (for storing/retrieving/searching memories), it should probably NOT have `disable-model-invocation: true` — the agent should be able to invoke it automatically when it needs to store or retrieve memories. But wait, let me look at the ticket again...

The ticket says: "Description: when to use this skill (storing, retrieving, searching memories during a session)."

Looking at the description pattern in other skills, the description tells the agent WHEN to use it. Since the agent should automatically know when to store/retrieve memories, I should NOT set `disable-model-invocation: true`.

Now let me think about the content. The ticket says:
- Do NOT duplicate the CLI reference or domain glossary; link to them
- The skill is the thin contract

So the SKILL.md should:
1. Have a description in frontmatter
2. Brief intro about what the skill does
3. Point to CONTEXT.md for vocabulary
4. List the CLI commands with one-line examples (referencing bin/memory.js)
5. Document the exploration pattern (frontier loop)
6. Document the memory-link convention

Let me look at how the CLI works again to write accurate examples:

From `../bin/memory.js`:
- `memory store <content> [--metadata <json>]` → prints id
- `memory update <id> [--content <text>] [--metadata <json>]` → prints "updated"
- `memory delete <id>` → prints "deleted"
- `memory link <from-id> <to-id> --kind <kind> [--metadata <json>]` → prints "linked"
- `memory search <query> [--where <sql>] [--limit N]` → prints JSON results
- `memory get <id>` → prints JSON or "not found"
- `memory list [--where <sql>] [--limit N] [--offset N]` → prints JSON
- `memory relations <id> [--direction out|in|both]` → prints JSON
- `memory stats` → prints JSON

Flags: `--db <path>`, `--help`

Now let me think about the structure. I want to match the tone and structure of neighbor skills. Let me model it after skills like `tdd` or `domain-modeling` which are relatively concise but have clear sections.

Actually, looking at the ticket more carefully, it says "Invocation: the CLI commands (reference bin/memory.js), with one-line examples." So I need to include the commands but keep them concise — one-liners.

Let me draft the SKILL.md:

```markdown
---
name: ai-memory
description: Persistent, searchable agent memory. Use when storing, retrieving, or searching memories during a session — notes, decisions, context, or anything worth recalling later.
---

# AI Memory

A per-project SQLite store for markdown memories connected by a typed directed graph. The agent writes memories via CLI commands; the store persists across sessions in `.ai-memory/memory.db`.

## Domain vocabulary

See `CONTEXT.md` for the glossary: memory, content, metadata, relation, kind, memory link, search, frontier, store. Use these terms when talking about memories.

## CLI

All commands go through `bin/memory.js` (run via `node bin/memory.js <command> ...`). The `--db <path>` flag overrides the store location for testing.

| Command | Example | Output |
|---|---|---|
| `store` | `memory store "Deployment uses pnpm not yarn" --metadata '{"kind":"note"}'` | the new memory id |
| `update` | `memory update <id> --content "Updated text"` | `updated` |
| `delete` | `memory delete <id>` | `deleted` |
| `link` | `memory link <from-id> <to-id> --kind references` | `linked` |
| `search` | `memory search "deployment pnpm" --limit 5` | JSON array of ranked results |
| `get` | `memory get <id>` | JSON memory or `not found` on stderr |
| `list` | `memory list --where "metadata->>'$.kind' = 'note'"` | JSON array of memories |
| `relations` | `memory relations <id> --direction out` | JSON array of edges |
| `stats` | `memory stats` | JSON with memory/edge counts |

stdout carries results (JSON); stderr carries errors; exit 1 on failure. `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.

`--metadata` takes a JSON string. `--where` takes a raw SQL fragment on the metadata JSON column (e.g. `metadata->>'$.kind' = 'note'`).

## Memory links

A `memory://<id>` reference inside a memory's content is a **memory link**. The `get` command resolves these. Markdown links to external resources (http, file paths) are authored text, not graph edges.

Use `link` to create searchable, typed **relations** between memories. A memory link in content is text; a relation is a graph edge.

## Exploration pattern: the frontier

When a memory is too large to load in full, follow the **frontier** loop:

1. **Search** by keyword (`memory search "..." --limit 5`) — small ranked results.
2. **Read** the matches (`memory get <id>`).
3. **Traverse** relations to related memories (`memory relations <id>`).
4. **Repeat** with new keywords drawn from what you've read.

Never load the whole DB. `LIMIT` at every step.
```

Wait, let me reconsider the table format. Looking at the existing skills, none use tables. Let me use a different format that matches better — perhaps a simple list format.

Also, let me reconsider whether I should include `disable-model-invocation`. Looking at the pattern:
- Skills with `disable-model-invocation: true`: implement, handoff, grill-me, wayfinder, teach, loop-me, to-spec, to-tickets, etc. — these are explicit user-invoked workflows
- Skills without it: prototype, research, diagnosing-bugs, tdd, domain-modeling, code-review — these can be auto-invoked by the model based on context

The ai-memory skill should be auto-invocable — the agent should reach for it when it needs to store or retrieve memories. So no `disable-model-invocation: true`.

Actually, wait. Let me reconsider. Let me look at the opencode docs about skills to understand how `disable-model-invocation` works.

Actually, I know from the system prompt that skills have `disable-model-invocation` — if true, the model can't auto-invoke them. For ai-memory, the agent should be able to auto-invoke it when it needs memory. So I'll leave it out (allowing model invocation).

Let me also think about whether I should include `--db` in the examples or keep it simple. The ticket says "one-line examples", so I'll keep the examples clean without `--db` and mention it as a note.

Let me also reconsider the description. Looking at other descriptions:
- "Persistent, searchable agent memory. Use when storing, retrieving, or searching memories during a session — notes, decisions, context, or anything worth recalling later."

That's good but maybe too long. Let me look at the pattern:
- tdd: "Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests."
- domain-modeling: "Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR."

So the pattern is: <what it is>. Use when <trigger conditions>.

Let me refine:
"Persistent, searchable agent memory via per-project SQLite. Use when the agent needs to store, retrieve, or search memories during a session — decisions, context, notes, or anything worth recalling later."

Hmm, let me think about this more carefully. The description needs to be good enough that the model knows WHEN to invoke this skill. 

OK, let me also think about the directory. The ticket says `../.agents/skills/ai-memory`. I need to create that directory and the SKILL.md file.

Let me now write the SKILL.md. I'll be careful to:
1. Not duplicate the CLI reference (that's in `bin/memory.js --help`) — but the ticket says to include one-line examples, so I'll include a compact reference with examples, not the full help text
2. Not duplicate the domain glossary — link to CONTEXT.md
3. Document the frontier loop
4. Document memory links

Let me draft it now. I want it to be concise, matching the neighbor skill tone.

Actually, re-reading the ticket: "Do not duplicate the CLI reference or the domain glossary inside SKILL.md; link to them."

So I should NOT include the full CLI reference — just enough for an agent to know the commands exist and how to call them. Let me link to `bin/memory.js --help` for the full reference.

But the ticket also says: "Invocation: the CLI commands (reference bin/memory.js), with one-line examples."

So I need to list the commands with one-line examples, but not duplicate the full reference (the help text, detailed flags, etc.). Let me find the right balance.

Let me write it now:

Good, I have a clear picture. The target directory doesn't exist yet. Let me create it and author the SKILL.md.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 05 (Skill authoring)",
      "status": "completed",
      "priority": "high"
    },
    {
      "content": "Study neighbor skill conventions",
      "status": "completed",
      "priority": "high"
    },
    {
      "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
      "status": "in_progress",
      "priority": "high"
    },
    {
      "content": "Verify against ticket acceptance criteria",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Resolve ticket and update map",
      "status": "pending",
      "priority": "high"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Claim ticket 05 (Skill authoring)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Study neighbor skill conventions",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Verify against ticket acceptance criteria",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Resolve ticket and update map",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 0.7s)

**Tool: bash**

**Input:**
```json
{
  "command": "mkdir -p /home/valentin/code/ai/ai-memory/.agents/skills/ai-memory"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · euria-code · 7.8s)

**Tool: write**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/SKILL.md",
  "content": "---\nname: ai-memory\ndescription: Store, retrieve, and search persistent markdown memories in a per-project SQLite store. Use when the agent needs to remember something across a session boundary, recall what was decided or learned earlier, or explore a large memory graph without loading the whole DB.\n---\n\n# AI Memory\n\nA persistent, searchable memory for agents: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.\n\n## When to use this skill\n\n- **Storing**: a decision was made, a fact learned, a pattern noticed — anything worth recalling in a future session. Store it as a memory with metadata.\n- **Retrieving**: you need a specific memory by its id, or a `memory://` link referenced in content.\n- **Searching**: you need memories matching keywords, optionally filtered by metadata, without loading the whole store.\n- **Exploring**: the store is too large for context — follow the frontier loop (search → read → traverse relations → repeat).\n\n## Domain vocabulary\n\nSee `CONTEXT.md` at the repo root for the canonical glossary: **memory**, **content**, **metadata**, **relation**, **kind**, **memory link**, **search**, **frontier**, **store**. Use these terms; they are the interface vocabulary.\n\n## The CLI\n\nAll commands go through `bin/memory.js`. Run via `node bin/memory.js <command> ...` or, if installed, `memory <command> ...`.\n\n### Writing memories\n\n```\nmemory store \"The user prefers tabs over spaces\" --metadata '{\"kind\":\"preference\",\"tags\":[\"coding\"]}'\n# stdout: <uuid>\n\nmemory update <id> --content \"Updated content\" --metadata '{\"kind\":\"note\"}'\n\nmemory delete <id>\n# edges cascade away\n```\n\n### Linking memories\n\n```\nmemory link <from-id> <to-id> --kind references\n# creates a typed, directed edge (idempotent — duplicate edges are ignored)\nmemory link <from-id> <to-id> --kind extends --metadata '{\"weight\":2}'\n```\n\n### Reading and searching\n\n```\nmemory search \"tabs spaces preference\" --limit 5\n# FTS5 ranked results as JSON\n\nmemory search \"preference\" --where \"metadata->>'$.kind' = 'note'\" --limit 10\n# combine text search with a metadata filter (raw SQL on the JSON column)\n\nmemory get <id>\n# full memory as JSON, or \"not found\" on stderr + exit 1\n\nmemory list --where \"metadata->>'$.kind' = 'decision'\" --limit 20 --offset 0\n# metadata-only filtering, no text query\n\nmemory relations <id> --direction both\n# incoming and outgoing edges as JSON\n\nmemory stats\n# counts: memories, edges, edges by kind\n```\n\n### Flags\n\n- `--db <path>` — override the store location (default: `.ai-memory/memory.db` in the current working directory).\n- `--metadata <json-string>` — JSON object for memory/edge metadata.\n- `--where <sql>` — raw SQL fragment on the `metadata` JSON column (e.g. `metadata->>'$.kind' = 'note'`).\n- `--limit N`, `--offset N` — pagination.\n- `--direction out|in|both` — relation direction (default: `both`).\n\n### Output contract\n\n- **stdout**: JSON results (pretty-printed, one document per command). `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.\n- **stderr**: `error: <message>` on failure.\n- **exit**: 0 on success, 1 on failure.\n\n## Memory links\n\nA **memory link** is a `memory://<uuid>` reference inside a memory's content. The `get` command resolves it to the full memory. Markdown links to external resources (http URLs, file paths) are just authored text — they are not graph edges.\n\nA memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.\n\n## Exploration: the frontier loop\n\nWhen the store is too large to load into context, explore it with the **frontier** loop — never load the whole DB:\n\n1. **Search** by keyword (`memory search \"...\" --limit 5`). Get a small, ranked set.\n2. **Read** the matches (`memory get <id>`). Pick the relevant ones.\n3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising.\n4. **Repeat** from step 1 with new keywords drawn from what you've read.\n\n`LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.\n\n## Conventions\n\n- The store lives at `.ai-memory/memory.db` (gitignored). One store per project.\n- UUID v4 ids; `memory://` link scheme.\n- WAL mode for concurrent reads; writes retry on busy.\n- Schema migrates on open — no manual migration step.\n- The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.\n"
}
```

**Output:**
```
Wrote file successfully.
```

---

## Assistant (Build · euria-code · 1.4s)

Now let me verify against the acceptance criteria and run typecheck/tests to make sure nothing broke.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 05 (Skill authoring)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Study neighbor skill conventions",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Verify against ticket acceptance criteria",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Resolve ticket and update map",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Claim ticket 05 (Skill authoring)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Study neighbor skill conventions",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Verify against ticket acceptance criteria",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Resolve ticket and update map",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 4.9s)

_Thinking:_

Let me verify the acceptance criteria from the ticket:

1. **SKILL.md** at `../.agents/skills/ai-memory/SKILL.md`. Follow the conventions of existing skills in `../.agents/skills` (read 2-3 neighbors for the shape). Contents:
   - ✅ **Description**: when to use this skill (storing, retrieving, searching memories during a session).
   - ✅ **Invocation**: the CLI commands (reference `../bin/memory.js`), with one-line examples.
   - ✅ **Domain vocabulary**: point to `../CONTEXT.md` for terms (memory, relation, kind, memory link, search, frontier).
   - ✅ **Exploration pattern**: document the frontier loop — search by keyword → read matches → traverse relations → repeat with `LIMIT`. This is how an agent explores a large memory without loading the whole DB.

2. **Memory-link convention**: document the `memory://<id>` scheme and that the `get` command resolves these. Note that markdown links to external resources (http, file paths) are just authored text, not graph edges.
   - ✅ Done.

3. **Do not** duplicate the CLI reference or the domain glossary inside SKILL.md; link to them. The skill is the thin contract; the library and `../CONTEXT.md` hold the detail.
   - ✅ I point to CONTEXT.md for the glossary and to src/db.ts for implementation detail. I do include CLI command examples, but those are necessary for the "Invocation" section. Let me re-read the ticket... it says "Do not duplicate the CLI reference" - I do have the full CLI reference in the skill. Let me think about this.

Actually, re-reading the ticket: "Do not duplicate the CLI reference or the domain glossary inside SKILL.md; link to them." This means I should NOT include the full CLI reference inline. I should link to it. But where is the CLI reference documented? The `--help` output in `../bin/memory.js` serves as the CLI reference. 

Hmm, but the ticket also says under point 2: "**Invocation**: the CLI commands (reference `../bin/memory.js`), with one-line examples." So it wants one-line examples, not a full reference. Let me re-read...

"Invocation: the CLI commands (reference bin/memory.js), with one-line examples." - So one-line examples are expected.

"Do not duplicate the CLI reference" - this means don't copy the full --help text / full reference documentation. One-line examples are fine, but I have multi-line blocks for each command.

I think I'm being a bit too verbose with the CLI. Let me trim it down to one-line examples per command, and point to `bin/memory.js --help` or the help text for the full reference. The skill is supposed to be a thin contract.

Actually, looking at the neighbor skills, they're quite varied in length. Some are very short (grill-me is 7 lines), some are longer. But the ticket explicitly says "Do not duplicate the CLI reference" and "one-line examples." Let me trim the CLI section to be more concise - one-line examples rather than multi-line blocks.

Let me also make sure I'm linking to the CLI reference (the help text / bin/memory.js) rather than restating it fully.

Let me revise.

Let me re-check the acceptance criteria more carefully. The ticket says "Do not duplicate the CLI reference" and wants "one-line examples." My CLI section is too verbose. Let me trim it to thin one-liners and link to the full reference.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/SKILL.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/SKILL.md</path>
<type>file</type>
<content>
1: ---
2: name: ai-memory
3: description: Store, retrieve, and search persistent markdown memories in a per-project SQLite store. Use when the agent needs to remember something across a session boundary, recall what was decided or learned earlier, or explore a large memory graph without loading the whole DB.
4: ---
5: 
6: # AI Memory
7: 
8: A persistent, searchable memory for agents: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.
9: 
10: ## When to use this skill
11: 
12: - **Storing**: a decision was made, a fact learned, a pattern noticed — anything worth recalling in a future session. Store it as a memory with metadata.
13: - **Retrieving**: you need a specific memory by its id, or a `memory://` link referenced in content.
14: - **Searching**: you need memories matching keywords, optionally filtered by metadata, without loading the whole store.
15: - **Exploring**: the store is too large for context — follow the frontier loop (search → read → traverse relations → repeat).
16: 
17: ## Domain vocabulary
18: 
19: See `CONTEXT.md` at the repo root for the canonical glossary: **memory**, **content**, **metadata**, **relation**, **kind**, **memory link**, **search**, **frontier**, **store**. Use these terms; they are the interface vocabulary.
20: 
21: ## The CLI
22: 
23: All commands go through `bin/memory.js`. Run via `node bin/memory.js <command> ...` or, if installed, `memory <command> ...`.
24: 
25: ### Writing memories
26: 
27: ```
28: memory store "The user prefers tabs over spaces" --metadata '{"kind":"preference","tags":["coding"]}'
29: # stdout: <uuid>
30: 
31: memory update <id> --content "Updated content" --metadata '{"kind":"note"}'
32: 
33: memory delete <id>
34: # edges cascade away
35: ```
36: 
37: ### Linking memories
38: 
39: ```
40: memory link <from-id> <to-id> --kind references
41: # creates a typed, directed edge (idempotent — duplicate edges are ignored)
42: memory link <from-id> <to-id> --kind extends --metadata '{"weight":2}'
43: ```
44: 
45: ### Reading and searching
46: 
47: ```
48: memory search "tabs spaces preference" --limit 5
49: # FTS5 ranked results as JSON
50: 
51: memory search "preference" --where "metadata->>'$.kind' = 'note'" --limit 10
52: # combine text search with a metadata filter (raw SQL on the JSON column)
53: 
54: memory get <id>
55: # full memory as JSON, or "not found" on stderr + exit 1
56: 
57: memory list --where "metadata->>'$.kind' = 'decision'" --limit 20 --offset 0
58: # metadata-only filtering, no text query
59: 
60: memory relations <id> --direction both
61: # incoming and outgoing edges as JSON
62: 
63: memory stats
64: # counts: memories, edges, edges by kind
65: ```
66: 
67: ### Flags
68: 
69: - `--db <path>` — override the store location (default: `.ai-memory/memory.db` in the current working directory).
70: - `--metadata <json-string>` — JSON object for memory/edge metadata.
71: - `--where <sql>` — raw SQL fragment on the `metadata` JSON column (e.g. `metadata->>'$.kind' = 'note'`).
72: - `--limit N`, `--offset N` — pagination.
73: - `--direction out|in|both` — relation direction (default: `both`).
74: 
75: ### Output contract
76: 
77: - **stdout**: JSON results (pretty-printed, one document per command). `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.
78: - **stderr**: `error: <message>` on failure.
79: - **exit**: 0 on success, 1 on failure.
80: 
81: ## Memory links
82: 
83: A **memory link** is a `memory://<uuid>` reference inside a memory's content. The `get` command resolves it to the full memory. Markdown links to external resources (http URLs, file paths) are just authored text — they are not graph edges.
84: 
85: A memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.
86: 
87: ## Exploration: the frontier loop
88: 
89: When the store is too large to load into context, explore it with the **frontier** loop — never load the whole DB:
90: 
91: 1. **Search** by keyword (`memory search "..." --limit 5`). Get a small, ranked set.
92: 2. **Read** the matches (`memory get <id>`). Pick the relevant ones.
93: 3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising.
94: 4. **Repeat** from step 1 with new keywords drawn from what you've read.
95: 
96: `LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.
97: 
98: ## Conventions
99: 
100: - The store lives at `.ai-memory/memory.db` (gitignored). One store per project.
101: - UUID v4 ids; `memory://` link scheme.
102: - WAL mode for concurrent reads; writes retry on busy.
103: - Schema migrates on open — no manual migration step.
104: - The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.

(End of file - total 104 lines)
</content>
```

---

## Assistant (Build · euria-code · 5.4s)

The CLI section is too detailed — the ticket says "Do not duplicate the CLI reference... link to them." The full CLI reference already lives in `../bin/memory.js`'s `--help` output. Let me tighten the SKILL.md to use one-line examples and point to `--help` for the full reference.

**Tool: write**

**Input:**
```json
{
  "content": "---\nname: ai-memory\ndescription: Store, retrieve, and search persistent markdown memories in a per-project SQLite store. Use when the agent needs to remember something across a session boundary, recall what was decided or learned earlier, or explore a large memory graph without loading the whole DB.\n---\n\n# AI Memory\n\nA persistent, searchable memory for agents: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.\n\n## When to use this skill\n\n- **Storing**: a decision was made, a fact learned, a pattern noticed — anything worth recalling in a future session. Store it as a memory with metadata.\n- **Retrieving**: you need a specific memory by its id, or a `memory://` link referenced in content.\n- **Searching**: you need memories matching keywords, optionally filtered by metadata, without loading the whole store.\n- **Exploring**: the store is too large for context — follow the frontier loop (search → read → traverse relations → repeat).\n\n## Domain vocabulary\n\nSee `CONTEXT.md` at the repo root for the canonical glossary: **memory**, **content**, **metadata**, **relation**, **kind**, **memory link**, **search**, **frontier**, **store**. Use these terms; they are the interface vocabulary.\n\n## CLI\n\nAll commands go through `bin/memory.js` (`node bin/memory.js <command> ...`, or `memory <command> ...` if installed). Run `memory --help` for the full command reference. One-line examples:\n\n```\nmemory store \"The user prefers tabs over spaces\" --metadata '{\"kind\":\"preference\"}'\nmemory update <id> --content \"Updated content\" --metadata '{\"kind\":\"note\"}'\nmemory delete <id>\nmemory link <from-id> <to-id> --kind references\nmemory search \"tabs spaces\" --where \"metadata->>'$.kind' = 'note'\" --limit 5\nmemory get <id>\nmemory list --where \"metadata->>'$.kind' = 'decision'\" --limit 20\nmemory relations <id> --direction both\nmemory stats\n```\n\nOutput: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.\n\n`--db <path>` overrides the store location (default: `.ai-memory/memory.db`).\n\n## Memory links\n\nA **memory link** is a `memory://<uuid>` reference inside a memory's content. The `get` command resolves it to the full memory. Markdown links to external resources (http URLs, file paths) are just authored text — they are not graph edges.\n\nA memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.\n\n## Exploration: the frontier loop\n\nWhen the store is too large to load into context, explore it with the **frontier** loop — never load the whole DB:\n\n1. **Search** by keyword (`memory search \"...\" --limit 5`). Get a small, ranked set.\n2. **Read** the matches (`memory get <id>`). Pick the relevant ones.\n3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising.\n4. **Repeat** from step 1 with new keywords drawn from what you've read.\n\n`LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.\n\n## Conventions\n\n- The store lives at `.ai-memory/memory.db` (gitignored). One store per project.\n- UUID v4 ids; `memory://` link scheme.\n- WAL mode for concurrent reads; writes retry on busy.\n- Schema migrates on open — no manual migration step.\n- The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.\n",
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/SKILL.md"
}
```

**Output:**
```
Wrote file successfully.
```

---

## Assistant (Build · euria-code · 6.1s)

Now let me verify the acceptance criteria:

1. **SKILL.md at `../.agents/skills/ai-memory/SKILL.md`** — done.
2. **Follow conventions of existing skills** — frontmatter with `name` + `description`, `---` fences, content sections. Done.
3. **Description**: when to use — storing, retrieving, searching memories during a session. Done.
4. **Invocation**: CLI commands with one-line examples. Done.
5. **Domain vocabulary**: points to `../CONTEXT.md`. Done.
6. **Exploration pattern**: frontier loop documented. Done.
7. **Memory-link convention**: `memory://<id>` scheme documented, `get` resolves them, external links are not edges. Done.
8. **Do not duplicate CLI reference or domain glossary**: links to `--help` and `../CONTEXT.md`. Done.
9. **Thin contract**: library holds detail. Done.

Let me verify typecheck and tests still pass (shouldn't be affected, but let's be safe).

**Tool: bash**

**Input:**
```json
{
  "command": "yarn typecheck 2>&1 && echo \"--- typecheck OK ---\" && yarn test 2>&1 | tail -5",
  "workdir": "/home/valentin/code/ai/ai-memory"
}
```

**Output:**
```
--- typecheck OK ---
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1148.169476

```

---

## Assistant (Build · euria-code · 2.9s)

**Tool: bash**

**Input:**
```json
{
  "command": "yarn test 2>&1 | grep -E \"^# (tests|pass|fail|cancelled)\" ",
  "workdir": "/home/valentin/code/ai/ai-memory"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · euria-code · 2.9s)

**Tool: bash**

**Input:**
```json
{
  "command": "yarn test 2>&1",
  "workdir": "/home/valentin/code/ai/ai-memory"
}
```

**Output:**
```
✔ open creates all tables on a fresh project (19.982637ms)
✔ reopening is a no-op (schema_version unchanged) (25.211675ms)
✔ WAL and FK pragmas are set (26.813329ms)
✔ FTS5 stays in sync: insert, update, delete (45.828302ms)
✔ FK cascade: deleting a memory removes its edges (41.466564ms)
✔ search: returns ranked FTS5 results (42.300085ms)
✔ search: bm25 ranking puts the best match first (45.058537ms)
✔ search: respects limit (45.426689ms)
✔ search: default limit is 20 (107.218038ms)
✔ search: applies where filter on metadata JSON path (37.942353ms)
✔ search: throws on empty query (25.437867ms)
✔ search: deserializes metadata JSON (34.183063ms)
✔ search: returns null metadata as null (29.871542ms)
✔ get: returns a memory by id (25.840576ms)
✔ get: returns null for unknown id (21.903286ms)
✔ get: returns null metadata as null (22.83031ms)
✔ list: returns memories ordered by created_at DESC (41.844501ms)
✔ list: respects limit and offset (43.094422ms)
✔ list: default limit is 20 (102.991269ms)
✔ list: applies where filter on metadata (28.265092ms)
✔ list: deserializes metadata JSON (16.56729ms)
✔ list: returns empty array when no memories (13.284491ms)
✔ relations: returns both in and out edges by default direction both (26.040356ms)
✔ relations: direction out returns only outgoing edges (33.795238ms)
✔ relations: direction in returns only incoming edges (33.602115ms)
✔ relations: includes metadata and created_at (21.993416ms)
✔ relations: throws on unknown id (14.484044ms)
✔ relations: returns empty array when no edges (18.43542ms)
✔ stats: returns total counts and edges_by_kind breakdown (25.780752ms)
✔ stats: returns empty counts on a fresh store (15.071235ms)
✔ stats: counts update after deletion (28.79416ms)
✔ store: inserts a memory with UUID id and returns it (30.613756ms)
✔ store: works without metadata (33.577732ms)
✔ store: throws on empty content (29.298576ms)
✔ store: FTS index stays in sync after insert (26.739587ms)
✔ update: changes content and keeps FTS in sync (28.90842ms)
✔ update: changes metadata (29.236624ms)
✔ update: throws on unknown id (24.29926ms)
✔ update: throws when no fields provided (26.363398ms)
✔ update: throws on empty content (28.719091ms)
✔ delete: removes a memory (31.037987ms)
✔ delete: FTS index removes the entry (31.217961ms)
✔ delete: cascades edges via FK (38.769852ms)
✔ delete: throws on unknown id (20.254392ms)
✔ link: creates a typed directed edge (35.436881ms)
✔ link: stores metadata as JSON (33.395093ms)
✔ link: duplicate (same from/to/kind) is ignored (idempotent) (36.097824ms)
✔ link: allows different kinds between same pair (36.62171ms)
✔ link: throws on unknown from_id (25.641268ms)
✔ link: throws on unknown to_id (24.530187ms)
✔ link: throws on empty kind (30.518079ms)
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1143.326768

```

---

## Assistant (Build · euria-code · 1.9s)

All 51 tests pass, typecheck clean. Now let me resolve the ticket and update the map.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 05 (Skill authoring)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Study neighbor skill conventions",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Verify against ticket acceptance criteria",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Resolve ticket and update map",
      "priority": "high",
      "status": "in_progress"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Claim ticket 05 (Skill authoring)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Study neighbor skill conventions",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Verify against ticket acceptance criteria",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Resolve ticket and update map",
    "status": "in_progress",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 1.0s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/05-skill-authoring.md",
  "oldString": "Type: task\nStatus: claimed\nBlocked by: 04",
  "newString": "Type: task\nStatus: resolved\nBlocked by: 04"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 0.7s)

Now append the answer to the ticket.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/05-skill-authoring.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/05-skill-authoring.md</path>
<type>file</type>
<content>
1: # Skill authoring (SKILL.md)
2: 
3: Type: task
4: Status: resolved
5: Blocked by: 04
6: 
7: ## Question
8: 
9: Author the opencode skill at `.agents/skills/ai-memory/` so the agent knows when and how to use the memory.
10: 
11: **Scope:**
12: 
13: 1. **SKILL.md** at `.agents/skills/ai-memory/SKILL.md`. Follow the conventions of existing skills in `.agents/skills/` (read 2-3 neighbors for the shape). Contents:
14:    - **Description**: when to use this skill (storing, retrieving, searching memories during a session).
15:    - **Invocation**: the CLI commands (reference `bin/memory.js`), with one-line examples.
16:    - **Domain vocabulary**: point to `CONTEXT.md` for terms (memory, relation, kind, memory link, search, frontier).
17:    - **Exploration pattern**: document the frontier loop — search by keyword → read matches → traverse relations → repeat with `LIMIT`. This is how an agent explores a large memory without loading the whole DB.
18: 
19: 2. **Memory-link convention**: document the `memory://<id>` scheme and that the `get` command resolves these. Note that markdown links to external resources (http, file paths) are just authored text, not graph edges.
20: 
21: 3. **Do not** duplicate the CLI reference or the domain glossary inside SKILL.md; link to them. The skill is the thin contract; the library and `CONTEXT.md` hold the detail.
22: 
23: **Acceptance**: a fresh agent reading SKILL.md knows what the skill does, when to reach for it, how to call each command, and how to explore a large memory. Matches the tone and structure of neighbor skills.

(End of file - total 23 lines)
</content>
```

---

## Assistant (Build · euria-code · 4.8s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/05-skill-authoring.md",
  "newString": "**Acceptance**: a fresh agent reading SKILL.md knows what the skill does, when to reach for it, how to call each command, and how to explore a large memory. Matches the tone and structure of neighbor skills.\n\n## Answer\n\nDone. Created `.agents/skills/ai-memory/SKILL.md`.\n\n**What was built:**\n\n- **SKILL.md** with standard frontmatter (`name`, `description`) following the conventions of neighbor skills (e.g. `research`, `prototype`, `tdd`): `---`-fenced frontmatter, then content sections.\n\n- **Description** (frontmatter): covers when to reach for the skill — storing, retrieving, searching, and exploring memories across sessions.\n\n- **When to use this skill**: four bullets (storing, retrieving, searching, exploring) matching the ticket's scope.\n\n- **Domain vocabulary**: points to `CONTEXT.md` at the repo root for the canonical glossary (memory, content, metadata, relation, kind, memory link, search, frontier, store). Does not restate the definitions.\n\n- **CLI**: one-line examples for all 9 commands, followed by `memory --help` as the pointer to the full reference. Does not duplicate the help text. Documents the output contract (stdout/stderr/exit) and the `--db` flag in one line each.\n\n- **Memory links**: documents the `memory://<uuid>` scheme, that `get` resolves them, and that external markdown links (http, file paths) are authored text, not graph edges. States the link-vs-relation distinction.\n\n- **Exploration: the frontier loop**: the four-step loop (search → read → traverse relations → repeat with `LIMIT`), matching the ticket's exploration pattern requirement.\n\n- **Conventions**: store location, UUID v4 ids, WAL mode, migrate-on-open, and the deep-module note (library is the deep module; skill is the thin contract).\n\n**Design decisions:**\n- CLI section uses one-line examples and points to `--help` rather than restating the full command reference — per the ticket's \"do not duplicate\" instruction.\n- Domain glossary is linked, not restated — per the same instruction.\n- The skill file is ~80 lines; concise enough for a fresh agent to load and act on.\n\n**Verification:**\n- `yarn typecheck`: clean (0 errors).\n- `yarn test`: 51/51 pass (unchanged; this ticket adds no code, only documentation).\n\n**Facts later tickets depend on:**\n- The skill lives at `.agents/skills/ai-memory/SKILL.md`.\n- It documents the CLI, the memory-link convention, and the frontier exploration loop.\n- It links to `CONTEXT.md` for vocabulary and `--help` for the full CLI reference.",
  "oldString": "**Acceptance**: a fresh agent reading SKILL.md knows what the skill does, when to reach for it, how to call each command, and how to explore a large memory. Matches the tone and structure of neighbor skills."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 0.8s)

Now update the map's Decisions-so-far.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/map.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/map.md</path>
<type>file</type>
<content>
1: # Map: AI Memory Skill
2: 
3: ## Destination
4: 
5: An opencode skill (CLI via bash, Node + `node:sqlite`) that lets an agent store, retrieve, and search markdown memories in a per-project SQLite DB, with FTS5 text search, a typed directed graph between memories, JSON metadata, `memory://<id>` links, WAL concurrency, and migrate-on-open schema. The build fits one session; this map charts the slices.
6: 
7: ## Notes
8: 
9: **Domain**: see `CONTEXT.md` for the glossary (memory, relation, kind, memory link, search, frontier) and `docs/adr/0001` for the graph-over-triple-store decision.
10: 
11: **Skills every session should consult**: `implement` or `implement-spec` for the build tickets; `domain-modeling` if terms shift; `tdd` if tests are wanted alongside.
12: 
13: **Standing preferences**:
14: - opencode-only for now; portability deferred.
15: - Library is the deep module; the skill is the thin agent-facing contract.
16: - `node:sqlite` (Node 22+ built-in), not better-sqlite3.
17: - Per-project store at `.ai-memory/memory.db` (gitignored).
18: - UUID v4 ids; `memory://<id>` link scheme.
19: - WAL mode + busy-retry for concurrency.
20: - Schema version table, migrate-on-open.
21: 
22: ## Decisions so far
23: 
24: <!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->
25: 
26: - [Scaffold and schema](issues/01-scaffold-and-schema.md): project scaffold + `Store.open()` with WAL, FK pragmas, busy-retry, v1 schema (memories/edges/schema_version/memories_fts + triggers), migrate-on-open; 5/5 smoke tests green.
27: 
28: - [Write operations](issues/02-write-operations.md): `store`/`update`/`delete`/`link` on `Store`; UUID v4 ids, idempotent edges (`INSERT OR IGNORE`), existence checks + clear errors, FTS/FK cascade via triggers; 25/25 tests green.
29: 
30: - [Read operations](issues/03-read-operations.md): `search`/`get`/`list`/`relations`/`stats` on `Store`; FTS5 `bm25` ranking, metadata `where` filters (raw SQL on JSON), `get` returns `null` for unknown id, `relations` throws; 51/51 tests green.
31: 
32: - [CLI entry and commands](issues/04-cli-entry.md): `bin/memory.js` (plain JS, executable) maps all 9 commands to `Store` methods; stdout JSON results, stderr errors, exit 1 on failure; `--db` override, `--metadata` JSON, `--where` raw SQL; 14/14 smoke tests + 6 error paths green; typecheck clean.
33: 
34: ## Not yet specified
35: 
36: <!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->
37: 
38: _None yet._ The design tree is fully settled; the frontier is the build itself. If implementation surfaces a new decision (e.g. FTS5 tokenizer config, metadata index strategy, `memory://` link auto-materialization into edges), graduate it here into a ticket.
39: 
40: ## Out of scope
41: 
42: <!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
43: 
44: - **MCP server / typed-tool transport.** CLI via bash is the v1 transport. MCP is a later, separate effort behind the same library.
45: - **Multi-tool portability (Claude Code, Cursor, etc.).** opencode-only for v1.
46: - **Vector / semantic search / embeddings.** Structured SQL + FTS5 only. Embeddings are a later layer if needed.
47: - **Dynamic DDL / agent-defined tables.** Fixed schema; agents impose structure via `metadata` JSON.
48: - **Triple-store / RDF model.** Ruled out by ADR-0001; see `docs/adr/0001-labeled-property-graph-over-triple-store.md`.
49: - **`unlink` CLI command.** Edge deletion is trivial to add later; v1 ships `link` only.

(End of file - total 49 lines)
</content>
```

---

## Assistant (Build · euria-code · 2.2s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/map.md",
  "newString": "- [CLI entry and commands](issues/04-cli-entry.md): `bin/memory.js` (plain JS, executable) maps all 9 commands to `Store` methods; stdout JSON results, stderr errors, exit 1 on failure; `--db` override, `--metadata` JSON, `--where` raw SQL; 14/14 smoke tests + 6 error paths green; typecheck clean.\n\n- [Skill authoring](issues/05-skill-authoring.md): `.agents/skills/ai-memory/SKILL.md` authored — when to use, one-line CLI examples (links to `--help` for full ref), `CONTEXT.md` for vocabulary, `memory://` link convention, frontier exploration loop; thin contract, no duplication.",
  "oldString": "- [CLI entry and commands](issues/04-cli-entry.md): `bin/memory.js` (plain JS, executable) maps all 9 commands to `Store` methods; stdout JSON results, stderr errors, exit 1 on failure; `--db` override, `--metadata` JSON, `--where` raw SQL; 14/14 smoke tests + 6 error paths green; typecheck clean."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 1.4s)

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 05 (Skill authoring)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Study neighbor skill conventions",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Verify against ticket acceptance criteria",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Resolve ticket and update map",
      "priority": "high",
      "status": "completed"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Claim ticket 05 (Skill authoring)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Study neighbor skill conventions",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Author SKILL.md at .agents/skills/ai-memory/SKILL.md",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Verify against ticket acceptance criteria",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Resolve ticket and update map",
    "status": "completed",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 1.5s)

Resolved **Skill authoring** (ticket 05). Created `../.agents/skills/ai-memory/SKILL.md` — a thin agent-facing contract with one-line CLI examples (links to `--help` for the full reference), `../CONTEXT.md` for vocabulary, the `memory://` link convention, and the frontier exploration loop. No duplication of the CLI reference or glossary. Typecheck clean, 51/51 tests pass.

The map now has 5 resolved tickets. The frontier's last open ticket is **06 - Integration test and gitignore** (blocked only by 04, now resolved). That's the next session's pick.

---

