# Wayfinder skill setup and overview

**Session ID:** ses_fc824e81afferFr4icbHX5hFZB
**Created:** 8/25/2026, 9:38:20 AM
**Updated:** 8/25/2026, 9:39:26 AM

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

## Assistant (Build · euria-code · 2.3s)

_Thinking:_

The user has invoked the wayfinder skill. Let me read the skill instructions and the map file they've referenced.

Let me first read the skill file and the map file they mentioned.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/wayfinder/SKILL.md"
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
34: - [Skill authoring](issues/05-skill-authoring.md): `.agents/skills/ai-memory/SKILL.md` authored — when to use, one-line CLI examples (links to `--help` for full ref), `CONTEXT.md` for vocabulary, `memory://` link convention, frontier exploration loop; thin contract, no duplication.
35: 
36: - [Integration test and gitignore](issues/06-integration-test.md): two integration tests (library-level + CLI-level via `execSync`) exercising full flow against temp DBs; `.ai-memory/` gitignored; README expanded with CLI table, dev workflow, architecture summary; 53/53 tests green, typecheck clean.
37: 
38: ## Not yet specified
39: 
40: <!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->
41: 
42: _None yet._ The two-agent evaluation surfaced concrete improvements (FTS5 query guidance, memory-writing best practices, `tags` command) now ticketed as 07 and 08. If implementation surfaces further decisions, graduate them here.
43: 
44: ## Out of scope
45: 
46: <!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
47: 
48: - **MCP server / typed-tool transport.** CLI via bash is the v1 transport. MCP is a later, separate effort behind the same library.
49: - **Multi-tool portability (Claude Code, Cursor, etc.).** opencode-only for v1.
50: - **Vector / semantic search / embeddings.** Structured SQL + FTS5 only. Embeddings are a later layer if needed.
51: - **Dynamic DDL / agent-defined tables.** Fixed schema; agents impose structure via `metadata` JSON.
52: - **Triple-store / RDF model.** Ruled out by ADR-0001; see `docs/adr/0001-labeled-property-graph-over-triple-store.md`.
53: - **`unlink` CLI command.** Edge deletion is trivial to add later; v1 ships `link` only.

(End of file - total 53 lines)
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

## Assistant (Build · euria-code · 2.5s)

_Thinking:_

Let me understand the situation:

1. The user has invoked the wayfinder skill by pasting its content
2. There's an existing map at `../.scratch/ai-memory-skill/map.md`
3. The map shows 6 decisions already made (all closed tickets), and "Not yet specified" mentions tickets 07 and 08

So this is the "Work through the map" mode - there's an existing map. Let me understand the current state:

- The map is at `../.scratch/ai-memory-skill/map.md`
- 6 tickets are closed (Decisions so far)
- "Not yet specified" mentions tickets 07 and 08 that were created from a two-agent evaluation

Let me check the issue tracker docs and look at the existing issues to understand the frontier.

I see an existing map at `../.scratch/ai-memory-skill/map.md`. This is **Work through the map** mode. Let me load the map and find the frontier.

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

**Tool: glob**

**Input:**
```json
{
  "pattern": ".scratch/ai-memory-skill/issues/*.md"
}
```

**Output:**
```
No files found
```

---

## Assistant (Build · euria-code · 1.4s)

_Thinking:_

No files found in `../.scratch/ai-memory-skill/issues`. But the map references `issues/01-scaffold-and-schema.md` through `issues/06-integration-test.md`. Let me check the actual directory structure.

**Tool: bash**

**Input:**
```json
{
  "command": "rtk ls -la /home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/ && echo \"---issues---\" && rtk ls -la /home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/ 2>/dev/null || echo \"no issues dir\""
}
```

**Output:**
```
issues/
agent-a-plan.md  10.6K
map.md  3.9K
test-plan.md  11.8K

3 files, 1 dirs (3 .md)
---issues---
01-scaffold-and-schema.md  4.7K
02-write-operations.md  3.8K
03-read-operations.md  4.9K
04-cli-entry.md  5.4K
05-skill-authoring.md  3.7K
06-integration-test.md  3.2K
07-skill-guidance.md  1.9K
08-tags-command.md  1.8K

8 files, 0 dirs (8 .md)

```

---

## Assistant (Build · euria-code · 1.0s)

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/07-skill-guidance.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/07-skill-guidance.md</path>
<type>file</type>
<content>
1: # SKILL.md: memory writing guidance + FTS5 query tips
2: 
3: Type: task
4: Status: open
5: 
6: ## Question
7: 
8: Update `.agents/skills/ai-memory/SKILL.md` to address three gaps surfaced by the two-agent evaluation:
9: 
10: 1. **FTS5 query syntax is undocumented.** A fresh session searching `memory search "design alternatives rejected"` got 0 hits because FTS5 doesn't match multi-word phrases that way. Agents need to know: quoted phrases (`"design alternatives"`), `OR` queries (`design OR alternatives`), and that FTS5 tokenizes on word boundaries. Without this, agents will miss memories they stored.
11: 
12: 2. **No memory-writing guidance.** The evaluation found memories were self-contained and well-structured, but also dense paragraphs covering multiple concepts in one memory. The SKILL.md should add brief guidance: write self-contained memories (understandable without prior context), one concept per memory (more retrievable, more linkable), include the keywords you'd search for in the content.
13: 
14: 3. **No session-summary convention.** The evaluation found no "orientation" memory — nothing a fresh session could search for to get oriented. Add a convention: at the end of each session, store a `kind: "summary"` memory that recaps what was done, key decisions, and what's next. This is the entry point for the next session's context recovery.
15: 
16: **Scope:**
17: 
18: - Edit `.agents/skills/ai-memory/SKILL.md` only (the thin agent-facing contract).
19: - Do not touch `CONTEXT.md` — no new domain terms are needed; "summary" is a `kind` value, not a new concept.
20: - Do not touch the library or CLI — this is guidance, not a system change.
21: 
22: **Acceptance:** SKILL.md has (a) an "FTS5 query tips" section with examples of phrase, OR, and single-word queries, (b) a "Writing good memories" section with the three guidelines, (c) a "Session summaries" convention in the exploration or conventions section. The file stays thin — one-line examples, no duplication of CLI reference.

(End of file - total 22 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/08-tags-command.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/08-tags-command.md</path>
<type>file</type>
<content>
1: # `tags` command implementation
2: 
3: Type: task
4: Status: open
5: Blocked by: 07
6: 
7: ## Question
8: 
9: Implement the `tags` CLI command per the plan at `.scratch/ai-memory-skill/agent-a-plan.md`.
10: 
11: The `tags` command lists all distinct metadata tags across memories, with counts. Tags are arrays stored inside the `metadata` JSON column (e.g. `{"kind":"finding","tags":["store","methods"]}`). The command aggregates tag frequencies using SQLite's `json_each` table-valued function — no schema change required.
12: 
13: **Scope** (from the plan):
14: 
15: 1. **`src/types.ts`**: Add `TagCount` interface (`{tag: string, count: number}`) and `TagsOptions` interface (`{where?: string}`).
16: 
17: 2. **`src/db.ts`**: Add `tags()` method to `Store`:
18:    ```sql
19:    SELECT json_each.value AS tag, count(*) AS count
20:    FROM memories, json_each(metadata->'$.tags')
21:    WHERE metadata IS NOT NULL
22:      AND json_type(metadata->'$.tags') = 'array'
23:    [AND <where>]
24:    GROUP BY tag ORDER BY count DESC, tag ASC
25:    ```
26:    The `json_type` guard prevents spurious rows from non-array tag values (discovered via prototyping in the evaluation).
27: 
28: 3. **`bin/memory.js`**: Add `tags` case to the switch + update HELP text. `memory tags [--where <sql>]` prints JSON array.
29: 
30: 4. **`src/tags.test.ts`**: New test file covering: empty store returns `[]`, tags with counts, ordering (count DESC, tag ASC), memories without tags excluded, null metadata excluded, non-array tags excluded (json_type guard), `--where` filter, aggregation across memories, duplicate tags in one memory.
31: 
32: 5. **`src/integration.test.ts`**: Add CLI smoke test for `tags` command.
33: 
34: 6. **`README.md`**: Add `tags` row to CLI commands table.
35: 
36: **Acceptance**: `yarn typecheck` clean, `yarn test` all green, `node bin/memory.js tags --db <temp>` returns tag counts as JSON, `--where` filter works.

(End of file - total 36 lines)
</content>
```

---

## Assistant (Build · euria-code · 10.7s)

_Thinking:_

So I have two open tickets: 07 and 08. 08 is blocked by 07. So the frontier is just 07: "SKILL.md: memory writing guidance + FTS5 query tips".

Ticket 07 is a `task` type (HITL or AFK). It's unblocked, unclaimed. Let me check: the map says "Not yet specified" is _None yet._ and the Decisions so far list 01-06 as resolved.

Let me check if 07 is actually still open and unclaimed. Yes: `Status: open`, no `Blocked by` line.

So the frontier is ticket 07. Per the skill, I should:
1. Claim it (set Status: claimed)
2. Resolve it (call skills as noted in Notes)
3. Record the resolution

The Notes say: "Skills every session should consult: `implement` or `implement-spec` for the build tickets; `domain-modeling` if terms shift; `tdd` if tests are wanted alongside."

This is a task ticket, specifically editing SKILL.md guidance. It's not really a "build" ticket — it's guidance authoring. Let me look at what the ticket asks:
- Edit `../.agents/skills/ai-memory/SKILL.md` to add: FTS5 query tips, writing good memories, session summaries convention.

This is a task type. The skill says for task: "The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL)." This one the agent can drive alone — it's editing a SKILL.md file.

But wait — the wayfinder skill says: "never resolve more than one ticket per session, with the exception of research tickets." And step 3: "Resolve it. Zoom as needed: fetch the full body of any related or closed ticket on demand; call the Skill tool for whichever skills the `## Notes` block names. If in doubt, call the Skill tool twice, for 'grilling' and 'domain-modeling'."

Hmm, but this is a task ticket. Let me think about whether I should just do it. The map's Destination is "An opencode skill (CLI via bash...)". The Notes say skills to consult: implement/implement-spec for build tickets. This is a guidance task, not a build. But it's still a task the agent can drive AFK.

Actually, the wayfinder skill is "Plan, don't do" by default. But this effort's Notes don't override that... Actually wait, let me reconsider. The map's destination is the actual build of the ai-memory skill. The tickets 01-06 were all resolved by actually doing the build (scaffold, write ops, read ops, CLI, skill authoring, integration test). So this effort IS carrying execution into the map itself. The "Plan, don't do" default has been overridden by the nature of this effort — the Decisions so far show actual implementation work was done.

Actually, looking more carefully: the tickets 01-06 are all "task" type and were resolved by actually implementing. So this effort has effectively overridden "plan, don't do" — it's doing the work within the map. That's consistent with "An effort can override this in its Notes, carrying execution into the map itself."

Well, actually the Notes don't explicitly say that. But the pattern of resolved tickets shows that's what's happening. The destination is a built thing. The tickets are build slices. Hmm, but the wayfinder skill says tickets are "questions whose resolution is a decision, not slices of a build to execute." But these tickets ARE build slices. 

Let me reconsider. Maybe these are being treated as decisions: e.g., "Scaffold and schema" resolved the decision of what the schema/scaffold looks like by actually building it and confirming it works. The "answer" is the decision embodied in code.

Regardless, the established pattern is: claim ticket 07, do the work (edit SKILL.md), record resolution. Ticket 08 is blocked by 07, so after 07 is done, 08 becomes the frontier.

Let me proceed. First, claim ticket 07. Then resolve it.

Actually, let me reconsider the HITL vs AFK. Task tickets can be AFK if the agent can drive alone. This one is editing a SKILL.md file — pure agent work. So AFK. I don't need to grill the user. But the wayfinder step 3 says "If in doubt, call the Skill tool twice, for 'grilling' and 'domain-modeling'."

For a task that's editing guidance docs, I don't think grilling is needed — there's no decision to sharpen, the ticket body is very specific about what to add. And domain-modeling: the ticket explicitly says "Do not touch CONTEXT.md — no new domain terms are needed." So no domain modeling needed.

So I'll just do the task. Let me claim it first, then read the current SKILL.md, then make the edits.

Let me set up a todo list since this is a multi-step task.

Two open tickets: **07** (unblocked, frontier) and **08** (blocked by 07). The frontier is [SKILL.md: memory writing guidance + FTS5 query tips](issues/07-skill-guidance.md). This effort has been executing build work within the map (tickets 01–06 all resolved by implementing), so I'll claim and resolve ticket 07.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 07 (set Status: claimed)",
      "status": "in_progress",
      "priority": "high"
    },
    {
      "content": "Read current SKILL.md to understand structure",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Add FTS5 query tips section",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Add 'Writing good memories' section",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Add session summaries convention",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Record resolution: answer + close + update map",
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
    "content": "Claim ticket 07 (set Status: claimed)",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Read current SKILL.md to understand structure",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add FTS5 query tips section",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add 'Writing good memories' section",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add session summaries convention",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Record resolution: answer + close + update map",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 1.3s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/07-skill-guidance.md",
  "oldString": "Type: task\nStatus: open",
  "newString": "Type: task\nStatus: claimed"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 1.3s)

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 07 (set Status: claimed)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Read current SKILL.md to understand structure",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Add FTS5 query tips section",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Add 'Writing good memories' section",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Add session summaries convention",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Record resolution: answer + close + update map",
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
    "content": "Claim ticket 07 (set Status: claimed)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Read current SKILL.md to understand structure",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Add FTS5 query tips section",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add 'Writing good memories' section",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add session summaries convention",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Record resolution: answer + close + update map",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 0.6s)

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
21: ## CLI
22: 
23: All commands go through `bin/memory.js` (`node bin/memory.js <command> ...`, or `memory <command> ...` if installed). Run `memory --help` for the full command reference. One-line examples:
24: 
25: ```
26: memory store "The user prefers tabs over spaces" --metadata '{"kind":"preference"}'
27: memory update <id> --content "Updated content" --metadata '{"kind":"note"}'
28: memory delete <id>
29: memory link <from-id> <to-id> --kind references
30: memory search "tabs spaces" --where "metadata->>'$.kind' = 'note'" --limit 5
31: memory get <id>
32: memory list --where "metadata->>'$.kind' = 'decision'" --limit 20
33: memory relations <id> --direction both
34: memory stats
35: ```
36: 
37: Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.
38: 
39: `--db <path>` overrides the store location (default: `.ai-memory/memory.db`).
40: 
41: ## Memory links
42: 
43: A **memory link** is a `memory://<uuid>` reference inside a memory's content. The `get` command resolves it to the full memory. Markdown links to external resources (http URLs, file paths) are just authored text — they are not graph edges.
44: 
45: A memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.
46: 
47: ## Exploration: the frontier loop
48: 
49: When the store is too large to load into context, explore it with the **frontier** loop — never load the whole DB:
50: 
51: 1. **Search** by keyword (`memory search "..." --limit 5`). Get a small, ranked set.
52: 2. **Read** the matches (`memory get <id>`). Pick the relevant ones.
53: 3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising.
54: 4. **Repeat** from step 1 with new keywords drawn from what you've read.
55: 
56: `LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.
57: 
58: ## Conventions
59: 
60: - The store lives at `.ai-memory/memory.db` (gitignored). One store per project.
61: - UUID v4 ids; `memory://` link scheme.
62: - WAL mode for concurrent reads; writes retry on busy.
63: - Schema migrates on open — no manual migration step.
64: - The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.

(End of file - total 64 lines)
</content>
```

---

## Assistant (Build · euria-code · 1.6s)

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 07 (set Status: claimed)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Read current SKILL.md to understand structure",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add FTS5 query tips section",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Add 'Writing good memories' section",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Add session summaries convention",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Record resolution: answer + close + update map",
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
    "content": "Claim ticket 07 (set Status: claimed)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Read current SKILL.md to understand structure",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add FTS5 query tips section",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Add 'Writing good memories' section",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add session summaries convention",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Record resolution: answer + close + update map",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 7.5s)

_Thinking:_

Now I need to add three things to SKILL.md:
1. FTS5 query tips section
2. Writing good memories section
3. Session summaries convention

Let me think about where each fits in the structure.

Current structure:
- # AI Memory
- ## When to use this skill
- ## Domain vocabulary
- ## CLI
- ## Memory links
- ## Exploration: the frontier loop
- ## Conventions

The FTS5 query tips should go near the CLI or exploration section, since it's about how to search effectively. I'll add it after the CLI section, before Memory links, or as a subsection of CLI. Actually, since the exploration loop mentions search, and the FTS5 tips are about how to search, it makes sense to put it right after the CLI section or right before/after the exploration section.

Actually, let me think about this more carefully. The ticket says:
- (a) an "FTS5 query tips" section with examples of phrase, OR, and single-word queries
- (b) a "Writing good memories" section with the three guidelines
- (c) a "Session summaries" convention in the exploration or conventions section

So FTS5 query tips is its own section. Writing good memories is its own section. Session summaries goes in exploration or conventions section.

Let me place:
- FTS5 query tips: after the CLI section (since it's about search queries), before Memory links. Or maybe right after the exploration section since it's about how to search. Actually, the exploration section already mentions search. Let me put it right after the exploration section.
- Writing good memories: this is about authoring memories, so it could go after the Memory links section or before the exploration section. It's about storing. Let me put it after Memory links and before Exploration.
- Session summaries: in the Conventions section.

Actually, let me reconsider the flow:
1. When to use
2. Domain vocabulary
3. CLI (how to call)
4. FTS5 query tips (how to search effectively) - makes sense right after CLI
5. Memory links
6. Writing good memories (how to author) - makes sense after memory links since it's about content
7. Exploration: the frontier loop
8. Conventions (including session summaries)

Let me think again. The FTS5 tips are about search query syntax. The CLI section shows `memory search "tabs spaces"`. The FTS5 tips explain how to construct those query strings. So right after CLI makes sense.

For "Writing good memories", it's guidance on content authoring. After Memory links makes sense since it's about what you put in a memory.

For "Session summaries", the ticket says "in the exploration or conventions section". Let me add it to Conventions as a convention.

Let me write these sections, keeping the file thin as the ticket requires.

Now I'll add the three sections. Let me place them logically in the flow: FTS5 query tips right after CLI (it's about search syntax), Writing good memories after Memory links (it's about content authoring), and Session summaries in Conventions.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/SKILL.md",
  "oldString": "`--db <path>` overrides the store location (default: `.ai-memory/memory.db`).\n\n## Memory links",
  "newString": "`--db <path>` overrides the store location (default: `.ai-memory/memory.db`).\n\n## FTS5 query tips\n\n`memory search` uses SQLite FTS5, which tokenizes on word boundaries and matches whole tokens, not substrings. A multi-word query like `design alternatives rejected` requires **all** terms to appear in a memory; if no single memory contains all three, you get zero hits. Construct queries accordingly:\n\n```\nmemory search \"tabs\"                         # single word — broadest\nmemory search \"tabs OR spaces\"               # either term — widen the net\nmemory search '\"design alternatives\"'        # quoted phrase — consecutive words\nmemory search '\"design alternatives\" rejected'  # phrase AND term\n```\n\n- **Single word** (`tabs`): matches any memory containing that token.\n- **OR** (`tabs OR spaces`): matches memories containing either term.\n- **Quoted phrase** (`\"design alternatives\"`): the words must appear consecutively. Use when order matters.\n- **Combined** (`\"design alternatives\" rejected`): phrase plus additional terms (implicit AND).\n\nIf a search returns nothing, try simpler queries, OR alternatives, or individual keywords drawn from what you're looking for.\n\n## Memory links"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 1.3s)

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 07 (set Status: claimed)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Read current SKILL.md to understand structure",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add FTS5 query tips section",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add 'Writing good memories' section",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Add session summaries convention",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Record resolution: answer + close + update map",
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
    "content": "Claim ticket 07 (set Status: claimed)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Read current SKILL.md to understand structure",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add FTS5 query tips section",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add 'Writing good memories' section",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Add session summaries convention",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Record resolution: answer + close + update map",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 2.6s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/SKILL.md",
  "newString": "A memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.\n\n## Writing good memories\n\nA memory is read by a future session that has no prior context — write accordingly:\n\n- **Self-contained.** Each memory should make sense on its own. A reader who never saw this session should understand it without preamble.\n- **One concept per memory.** Split dense paragraphs covering multiple decisions into separate memories, then `link` them. Single-concept memories are more retrievable (better search hits) and more linkable (sharper graph edges).\n- **Include search keywords.** Use the words you'd search for — terms of art, names, identifiers — directly in the content. FTS5 matches tokens, not semantics; if the keyword isn't in the text, the search won't find it.\n\n## Exploration: the frontier loop",
  "oldString": "A memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.\n\n## Exploration: the frontier loop"
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
      "content": "Claim ticket 07 (set Status: claimed)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Read current SKILL.md to understand structure",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add FTS5 query tips section",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add 'Writing good memories' section",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add session summaries convention",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Record resolution: answer + close + update map",
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
    "content": "Claim ticket 07 (set Status: claimed)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Read current SKILL.md to understand structure",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add FTS5 query tips section",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add 'Writing good memories' section",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add session summaries convention",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Record resolution: answer + close + update map",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 3.2s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.agents/skills/ai-memory/SKILL.md",
  "newString": "## Conventions\n\n- The store lives at `.ai-memory/memory.db` (gitignored). One store per project.\n- UUID v4 ids; `memory://` link scheme.\n- WAL mode for concurrent reads; writes retry on busy.\n- Schema migrates on open — no manual migration step.\n- The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.\n- **Session summaries.** At the end of a session, store a `kind: \"summary\"` memory recapping what was done, key decisions, and what's next. A fresh session searches for `kind: \"summary\"` to get oriented before diving in. Link the summary to the memories it references.",
  "oldString": "## Conventions\n\n- The store lives at `.ai-memory/memory.db` (gitignored). One store per project.\n- UUID v4 ids; `memory://` link scheme.\n- WAL mode for concurrent reads; writes retry on busy.\n- Schema migrates on open — no manual migration step.\n- The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 1.5s)

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 07 (set Status: claimed)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Read current SKILL.md to understand structure",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add FTS5 query tips section",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add 'Writing good memories' section",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add session summaries convention",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Record resolution: answer + close + update map",
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
    "content": "Claim ticket 07 (set Status: claimed)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Read current SKILL.md to understand structure",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add FTS5 query tips section",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add 'Writing good memories' section",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add session summaries convention",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Record resolution: answer + close + update map",
    "status": "in_progress",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 5.8s)

Let me verify the final file reads correctly, then record the resolution.

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
21: ## CLI
22: 
23: All commands go through `bin/memory.js` (`node bin/memory.js <command> ...`, or `memory <command> ...` if installed). Run `memory --help` for the full command reference. One-line examples:
24: 
25: ```
26: memory store "The user prefers tabs over spaces" --metadata '{"kind":"preference"}'
27: memory update <id> --content "Updated content" --metadata '{"kind":"note"}'
28: memory delete <id>
29: memory link <from-id> <to-id> --kind references
30: memory search "tabs spaces" --where "metadata->>'$.kind' = 'note'" --limit 5
31: memory get <id>
32: memory list --where "metadata->>'$.kind' = 'decision'" --limit 20
33: memory relations <id> --direction both
34: memory stats
35: ```
36: 
37: Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.
38: 
39: `--db <path>` overrides the store location (default: `.ai-memory/memory.db`).
40: 
41: ## FTS5 query tips
42: 
43: `memory search` uses SQLite FTS5, which tokenizes on word boundaries and matches whole tokens, not substrings. A multi-word query like `design alternatives rejected` requires **all** terms to appear in a memory; if no single memory contains all three, you get zero hits. Construct queries accordingly:
44: 
45: ```
46: memory search "tabs"                         # single word — broadest
47: memory search "tabs OR spaces"               # either term — widen the net
48: memory search '"design alternatives"'        # quoted phrase — consecutive words
49: memory search '"design alternatives" rejected'  # phrase AND term
50: ```
51: 
52: - **Single word** (`tabs`): matches any memory containing that token.
53: - **OR** (`tabs OR spaces`): matches memories containing either term.
54: - **Quoted phrase** (`"design alternatives"`): the words must appear consecutively. Use when order matters.
55: - **Combined** (`"design alternatives" rejected`): phrase plus additional terms (implicit AND).
56: 
57: If a search returns nothing, try simpler queries, OR alternatives, or individual keywords drawn from what you're looking for.
58: 
59: ## Memory links
60: 
61: A **memory link** is a `memory://<uuid>` reference inside a memory's content. The `get` command resolves it to the full memory. Markdown links to external resources (http URLs, file paths) are just authored text — they are not graph edges.
62: 
63: A memory link is distinct from a **relation**: a link is authored text in content; a relation is a searchable graph edge created via `link`. A link may optionally be materialized into a relation, but the two are separate concepts.
64: 
65: ## Writing good memories
66: 
67: A memory is read by a future session that has no prior context — write accordingly:
68: 
69: - **Self-contained.** Each memory should make sense on its own. A reader who never saw this session should understand it without preamble.
70: - **One concept per memory.** Split dense paragraphs covering multiple decisions into separate memories, then `link` them. Single-concept memories are more retrievable (better search hits) and more linkable (sharper graph edges).
71: - **Include search keywords.** Use the words you'd search for — terms of art, names, identifiers — directly in the content. FTS5 matches tokens, not semantics; if the keyword isn't in the text, the search won't find it.
72: 
73: ## Exploration: the frontier loop
74: 
75: When the store is too large to load into context, explore it with the **frontier** loop — never load the whole DB:
76: 
77: 1. **Search** by keyword (`memory search "..." --limit 5`). Get a small, ranked set.
78: 2. **Read** the matches (`memory get <id>`). Pick the relevant ones.
79: 3. **Traverse** relations to related memories (`memory relations <id>`). Follow edges that look promising.
80: 4. **Repeat** from step 1 with new keywords drawn from what you've read.
81: 
82: `LIMIT` at every step. The point is to follow a thread through the graph, not to dump the database.
83: 
84: ## Conventions
85: 
86: - The store lives at `.ai-memory/memory.db` (gitignored). One store per project.
87: - UUID v4 ids; `memory://` link scheme.
88: - WAL mode for concurrent reads; writes retry on busy.
89: - Schema migrates on open — no manual migration step.
90: - The library (`src/db.ts`) is the deep module; this skill is the thin agent-facing contract. For implementation detail, read the library, not this file.
91: - **Session summaries.** At the end of a session, store a `kind: "summary"` memory recapping what was done, key decisions, and what's next. A fresh session searches for `kind: "summary"` to get oriented before diving in. Link the summary to the memories it references.

(End of file - total 91 lines)
</content>
```

---

## Assistant (Build · euria-code · 2.2s)

_Thinking:_

The file looks good. All three additions are in place:
1. FTS5 query tips section (after CLI, before Memory links) - covers phrase, OR, single-word, and combined queries with examples
2. Writing good memories section (after Memory links, before Exploration) - three guidelines: self-contained, one concept per memory, include search keywords
3. Session summaries convention (in Conventions section) - kind: "summary" memory at end of session

The file stays thin - one-line examples, no duplication of CLI reference. Now I need to record the resolution:
1. Append answer to the ticket file under `## Answer` heading
2. Set Status: resolved
3. Append context pointer to map's Decisions-so-far

The SKILL.md reads well. All three additions are placed logically and stay thin. Now I'll record the resolution: append the answer to the ticket, close it, and update the map.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/07-skill-guidance.md"
}
```

**Output:**
```
<path>/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/07-skill-guidance.md</path>
<type>file</type>
<content>
1: # SKILL.md: memory writing guidance + FTS5 query tips
2: 
3: Type: task
4: Status: claimed
5: 
6: ## Question
7: 
8: Update `.agents/skills/ai-memory/SKILL.md` to address three gaps surfaced by the two-agent evaluation:
9: 
10: 1. **FTS5 query syntax is undocumented.** A fresh session searching `memory search "design alternatives rejected"` got 0 hits because FTS5 doesn't match multi-word phrases that way. Agents need to know: quoted phrases (`"design alternatives"`), `OR` queries (`design OR alternatives`), and that FTS5 tokenizes on word boundaries. Without this, agents will miss memories they stored.
11: 
12: 2. **No memory-writing guidance.** The evaluation found memories were self-contained and well-structured, but also dense paragraphs covering multiple concepts in one memory. The SKILL.md should add brief guidance: write self-contained memories (understandable without prior context), one concept per memory (more retrievable, more linkable), include the keywords you'd search for in the content.
13: 
14: 3. **No session-summary convention.** The evaluation found no "orientation" memory — nothing a fresh session could search for to get oriented. Add a convention: at the end of each session, store a `kind: "summary"` memory that recaps what was done, key decisions, and what's next. This is the entry point for the next session's context recovery.
15: 
16: **Scope:**
17: 
18: - Edit `.agents/skills/ai-memory/SKILL.md` only (the thin agent-facing contract).
19: - Do not touch `CONTEXT.md` — no new domain terms are needed; "summary" is a `kind` value, not a new concept.
20: - Do not touch the library or CLI — this is guidance, not a system change.
21: 
22: **Acceptance:** SKILL.md has (a) an "FTS5 query tips" section with examples of phrase, OR, and single-word queries, (b) a "Writing good memories" section with the three guidelines, (c) a "Session summaries" convention in the exploration or conventions section. The file stays thin — one-line examples, no duplication of CLI reference.

(End of file - total 22 lines)
</content>
```

---

## Assistant (Build · euria-code · 8.7s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/07-skill-guidance.md",
  "newString": "Type: task\nStatus: resolved",
  "oldString": "Type: task\nStatus: claimed"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 3.3s)

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/issues/07-skill-guidance.md",
  "newString": "**Acceptance:** SKILL.md has (a) an \"FTS5 query tips\" section with examples of phrase, OR, and single-word queries, (b) a \"Writing good memories\" section with the three guidelines, (c) a \"Session summaries\" convention in the exploration or conventions section. The file stays thin — one-line examples, no duplication of CLI reference.\n\n## Answer\n\nUpdated `.agents/skills/ai-memory/SKILL.md` with three additions:\n\n1. **FTS5 query tips** (after CLI, before Memory links): explains FTS5 word-boundary tokenization, implicit AND, and shows four query forms — single word, OR, quoted phrase, phrase+term. Includes a \"narrowed to nothing\" fallback tip.\n\n2. **Writing good memories** (after Memory links, before Exploration): three guidelines — self-contained, one concept per memory, include search keywords. Each with a one-line rationale tying it to retrieval or graph properties.\n\n3. **Session summaries** (appended to Conventions): store `kind: \"summary\"` at session end, search for it to get oriented next session, link to referenced memories.\n\nAll three placed in logical reading order. File stays thin: one-line CLI examples, no CLI reference duplication. No changes to CONTEXT.md, library, or CLI. Acceptance criteria met.\n",
  "oldString": "**Acceptance:** SKILL.md has (a) an \"FTS5 query tips\" section with examples of phrase, OR, and single-word queries, (b) a \"Writing good memories\" section with the three guidelines, (c) a \"Session summaries\" convention in the exploration or conventions section. The file stays thin — one-line examples, no duplication of CLI reference."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 2.0s)

Now update the map's Decisions-so-far:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/valentin/code/ai/ai-memory/.scratch/ai-memory-skill/map.md",
  "newString": "- [Integration test and gitignore](issues/06-integration-test.md): two integration tests (library-level + CLI-level via `execSync`) exercising full flow against temp DBs; `.ai-memory/` gitignored; README expanded with CLI table, dev workflow, architecture summary; 53/53 tests green, typecheck clean.\n\n- [SKILL.md: memory writing guidance + FTS5 query tips](issues/07-skill-guidance.md): added FTS5 query tips (tokenization, phrase/OR/combined queries), Writing good memories (self-contained, one concept, include keywords), Session summaries convention (`kind: \"summary\"` for orientation); SKILL.md only, no library/CLI changes.",
  "oldString": "- [Integration test and gitignore](issues/06-integration-test.md): two integration tests (library-level + CLI-level via `execSync`) exercising full flow against temp DBs; `.ai-memory/` gitignored; README expanded with CLI table, dev workflow, architecture summary; 53/53 tests green, typecheck clean."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · euria-code · 1.1s)

Now check: ticket 08 was blocked by 07. Since 07 is resolved, 08 is now unblocked — it's the new frontier. No fog to graduate (the map says _None yet_). Let me verify the map is consistent.

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
34: - [Skill authoring](issues/05-skill-authoring.md): `.agents/skills/ai-memory/SKILL.md` authored — when to use, one-line CLI examples (links to `--help` for full ref), `CONTEXT.md` for vocabulary, `memory://` link convention, frontier exploration loop; thin contract, no duplication.
35: 
36: - [Integration test and gitignore](issues/06-integration-test.md): two integration tests (library-level + CLI-level via `execSync`) exercising full flow against temp DBs; `.ai-memory/` gitignored; README expanded with CLI table, dev workflow, architecture summary; 53/53 tests green, typecheck clean.
37: 
38: - [SKILL.md: memory writing guidance + FTS5 query tips](issues/07-skill-guidance.md): added FTS5 query tips (tokenization, phrase/OR/combined queries), Writing good memories (self-contained, one concept, include keywords), Session summaries convention (`kind: "summary"` for orientation); SKILL.md only, no library/CLI changes.
39: 
40: ## Not yet specified
41: 
42: <!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->
43: 
44: _None yet._ The two-agent evaluation surfaced concrete improvements (FTS5 query guidance, memory-writing best practices, `tags` command) now ticketed as 07 and 08. If implementation surfaces further decisions, graduate them here.
45: 
46: ## Out of scope
47: 
48: <!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
49: 
50: - **MCP server / typed-tool transport.** CLI via bash is the v1 transport. MCP is a later, separate effort behind the same library.
51: - **Multi-tool portability (Claude Code, Cursor, etc.).** opencode-only for v1.
52: - **Vector / semantic search / embeddings.** Structured SQL + FTS5 only. Embeddings are a later layer if needed.
53: - **Dynamic DDL / agent-defined tables.** Fixed schema; agents impose structure via `metadata` JSON.
54: - **Triple-store / RDF model.** Ruled out by ADR-0001; see `docs/adr/0001-labeled-property-graph-over-triple-store.md`.
55: - **`unlink` CLI command.** Edge deletion is trivial to add later; v1 ships `link` only.

(End of file - total 55 lines)
</content>
```

---

## Assistant (Build · euria-code · 1.5s)

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Claim ticket 07 (set Status: claimed)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Read current SKILL.md to understand structure",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add FTS5 query tips section",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add 'Writing good memories' section",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add session summaries convention",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Record resolution: answer + close + update map",
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
    "content": "Claim ticket 07 (set Status: claimed)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Read current SKILL.md to understand structure",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add FTS5 query tips section",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add 'Writing good memories' section",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add session summaries convention",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Record resolution: answer + close + update map",
    "status": "completed",
    "priority": "high"
  }
]
```

---

## Assistant (Build · euria-code · 1.2s)

Resolved [SKILL.md: memory writing guidance + FTS5 query tips](../.scratch/ai-memory-skill/issues/07-skill-guidance.md): added three sections to `../.agents/skills/ai-memory/SKILL.md` — FTS5 query tips, Writing good memories, and the Session summaries convention. Map updated.

The new frontier is [`tags` command implementation](../.scratch/ai-memory-skill/issues/08-tags-command.md) (was blocked by 07, now unblocked). That's the last open ticket — no fog to graduate.

---

