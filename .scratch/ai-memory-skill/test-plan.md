# AI Memory Test Plan: Two-Agent Evaluation

Test the memory system by having one agent **use** it under realistic context loss, then having another agent **evaluate** the quality of memory usage.

---

## Roles

| Role | Name | What it does |
|---|---|---|
| A | **Memory User** | Completes a multi-session task, relying on `memory` CLI to persist and recover context between sessions. |
| B | **Evaluator** | Inspects the memory store after Agent A finishes, evaluates memory quality, graph usage, and whether memory helped. |

Both agents run in this repo. The memory store is `.ai-memory/memory.db` (or a `--db` override for test isolation).

---

## The Task (for Agent A)

Agent A receives a task that is **too large for one context window** and naturally spans multiple sessions. The task must require:

- **Storing** decisions, findings, and plans as memories.
- **Searching** to recover context after context loss.
- **Linking** memories with typed relations to build a navigable graph.
- **Filtering** by metadata to find the right subset.

### Recommended task: "Explore and plan"

> Explore this codebase (`src/`, `bin/`, `docs/`, `CONTEXT.md`) and produce a plan to add a **`tags` command** to the CLI — a command that lists all distinct metadata tags across memories, with counts. The plan must include: schema impact (if any), library changes, CLI changes, test strategy, and at least two design alternatives considered and rejected.

This task works because:
- The codebase is small enough to explore but big enough that findings won't fit in a short context.
- It requires storing structural findings (schema, types, CLI patterns), decisions (design alternatives), and plans (what to change).
- Relations are natural: "design alternative A *contradicts* design alternative B", "finding *references* plan".
- Metadata is useful: `{ kind: "finding" | "decision" | "plan", area: "schema" | "cli" | "tests" }`.

### Alternative tasks

| Task | Why it works |
|---|---|
| Debug an injected bug across sessions | Forces storing hypotheses, what was tried, what failed |
| Research a topic from web sources | Forces storing findings with source metadata, linking related sources |
| Refactor plan for a module | Forces understanding current structure, storing patterns, planning changes |

---

## Phase 1: Agent A — Memory User

### Setup

```bash
# Fresh test store (isolated from the real project store)
node bin/memory.js stats --db .ai-memory/test-eval.db
# Should show: { memories: 0, edges: 0, edges_by_kind: {} }
```

Agent A is given:
1. The task description (above).
2. The `memory --help` output (or the SKILL.md).
3. The instruction: **you will lose all context between sessions. Store what you need to recover.**

### Session 1 — Explore and store

Agent A explores the codebase and stores memories as it goes. Instructions for Agent A:

- **Store findings** as memories with `metadata: { kind: "finding", area: "<area>" }`.
  - Example: `memory store "The Store class in src/db.ts has 9 public methods: store, update, delete, link, search, get, list, relations, stats" --metadata '{"kind":"finding","area":"library"}' --db .ai-memory/test-eval.db`
- **Store decisions** as memories with `metadata: { kind: "decision" }`.
- **Store plans** as memories with `metadata: { kind: "plan", area: "<area>" }`.
- **Link related memories**: `memory link <from-id> <to-id> --kind references --db .ai-memory/test-eval.db`
- Use meaningful relation kinds: `references`, `contradicts`, `extends`, `supersedes`.

**End of Session 1**: Agent A's context is wiped. It keeps nothing — no notes, no scratchpad, no open files. Only the memory store persists.

### Session 2 — Recover and continue

Agent A starts fresh with only:
1. The task description.
2. The `memory --help` output.
3. The instruction: **you worked on this before. Search your memories to recover context.**

Agent A must:
- `memory search "<keywords>" --db .ai-memory/test-eval.db` to find what it stored.
- `memory list --where "metadata->>'$.kind' = 'plan'" --db .ai-memory/test-eval.db` to find plans.
- `memory relations <id> --db .ai-memory/test-eval.db` to traverse the graph.
- Continue the task, storing new findings and updating plans.

**End of Session 2**: Context wiped again.

### Session 3 — Finish

Agent A starts fresh again, recovers context from memory, and produces the final deliverable: the implementation plan document.

### What Agent A should demonstrate

- **Context recovery**: Successfully finds prior work via search, not by guessing.
- **Graph traversal**: Uses `relations` to follow a thread (finding → decision → plan).
- **Metadata filtering**: Uses `--where` to narrow by kind or area.
- **Incremental building**: Adds to the memory graph across sessions, doesn't re-do work.
- **Memory hygiene**: Doesn't store noise; doesn't duplicate; updates stale memories.

---

## Phase 2: Agent B — Evaluator

### Setup

Agent B is given:
1. The memory store path (`.ai-memory/test-eval.db`).
2. The original task description.
3. Agent A's final deliverable (the plan document).
4. The `memory --help` output.

Agent B has **read-only access** to the store (it can run all read commands but not write).

### Evaluation criteria

Agent B evaluates across five dimensions, scoring each 1–5 with qualitative notes.

#### 1. Memory quality (signal vs noise)

```bash
memory stats --db .ai-memory/test-eval.db
memory list --limit 100 --db .ai-memory/test-eval.db
```

| Score | Description |
|---|---|
| 5 | Every memory is useful, well-written, has good metadata. No noise. |
| 3 | Mostly useful memories, some noise or poorly structured. |
| 1 | Mostly noise, memories are too vague or too large, metadata missing. |

Check:
- Is content clear and self-contained? (Can you understand the memory without prior context?)
- Is metadata used consistently? (`kind`, `area`, `tags`)
- Are memories appropriately sized? (Not a wall of text, not a single sentence with no context)
- Is there duplication? (Same finding stored twice)

#### 2. Graph usage

```bash
memory relations <id> --direction both --db .ai-memory/test-eval.db
```

| Score | Description |
|---|---|
| 5 | Relations are meaningful, help navigate the graph, use varied kinds. |
| 3 | Some relations, but mostly `references` with no clear purpose. |
| 1 | No relations, or relations that are meaningless (everything linked to everything). |

Check:
- Do relations connect memories that are genuinely related?
- Are relation kinds meaningful? (`references`, `contradicts`, `extends`, `supersedes` — not all `references`)
- Can you follow a thread through the graph? (finding → decision → plan)
- Is the graph navigable, or a hairball?

#### 3. Context recovery

Agent B asks: **Could Agent A actually recover context from memory?**

Check by attempting the recovery yourself:

```bash
# What would Agent A search for at the start of Session 2?
memory search "schema" --db .ai-memory/test-eval.db
memory search "CLI commands" --db .ai-memory/test-eval.db
memory search "plan tags" --db .ai-memory/test-eval.db

# What would it find?
memory list --where "metadata->>'$.kind' = 'plan'" --db .ai-memory/test-eval.db
memory list --where "metadata->>'$.kind' = 'decision'" --db .ai-memory/test-eval.db
```

| Score | Description |
|---|---|
| 5 | Search with obvious keywords surfaces the right memories. Graph traversal works. |
| 3 | Some recovery is possible, but key memories are hard to find (bad keywords in content, no relations). |
| 1 | Recovery is nearly impossible — Agent A would have to re-do everything. |

Check:
- Are memories searchable? (Do they contain the keywords you'd naturally search for?)
- Are there relations to follow from initial search hits to related memories?
- Is there a "starting point" memory? (A plan or summary that orients a new session.)

#### 4. Gaps and over-storage

Agent B compares the memory store against the task requirements.

Check:
- **Gaps**: What should have been stored but wasn't? (e.g., a design decision that was made but not recorded, a constraint that was discovered but not saved)
- **Over-storage**: What was stored but wasn't useful? (e.g., raw file dumps, trivial observations, memories that duplicate each other)

| Score | Description |
|---|---|
| 5 | No significant gaps, no over-storage. Everything stored is useful; everything needed was stored. |
| 3 | Some gaps or some noise, but the store is usable. |
| 1 | Critical gaps (key decisions missing) or severe over-storage (mostly noise). |

#### 5. Outcome quality

Agent B evaluates whether the memory system **helped** Agent A produce a better result.

Compare:
- The final deliverable (the plan) against the task requirements.
- Whether the plan references prior findings and decisions (i.e., it was built on recovered memory, not re-discovered from scratch).

| Score | Description |
|---|---|
| 5 | The deliverable is complete, well-grounded, and clearly built on prior sessions' work. |
| 3 | The deliverable is adequate but might have been produced without memory. |
| 1 | The deliverable is poor, or Agent A re-did work instead of recovering it. |

### Evaluation output format

Agent B produces a structured evaluation:

```markdown
# Memory Evaluation

## Store summary
- Memories: <count>
- Edges: <count>
- Edge kinds: <breakdown>

## Scores

| Dimension | Score | Notes |
|---|---|---|
| Memory quality | /5 | |
| Graph usage | /5 | |
| Context recovery | /5 | |
| Gaps and over-storage | /5 | |
| Outcome quality | /5 | |
| **Total** | /25 | |

## Detailed findings

### Memory quality
<qualitative notes, with specific memory ids cited>

### Graph usage
<qualitative notes>

### Context recovery
<what you tried, what you found, what was missing>

### Gaps
<what should have been stored but wasn't>

### Over-storage
<what was stored but wasn't useful>

## Recommendations
<what Agent A should do differently next time>
```

---

## How to run the test

### Option A: Manual (two terminal sessions)

1. **Session 1**: Start an agent (or agent session) with the task. Let it explore and store memories.
2. **Session 2**: Start a fresh agent session with only the task + `memory --help`. Let it recover and continue.
3. **Session 3**: Start another fresh session. Let it finish.
4. **Evaluation**: Start a fresh agent session as Agent B with the evaluation instructions.

Use `--db .ai-memory/test-eval.db` for all commands to isolate from the real store.

### Option B: Automated (scripted prompts)

Write three prompt files and a runner:

```
test/
  prompts/
    session-1.md    # task + "store what you need"
    session-2.md    # task + "you worked on this before, search your memories"
    session-3.md    # task + "finish, recover from memory"
    evaluator.md    # evaluation instructions
  run.sh            # runs each in sequence, wiping agent context between
```

Each prompt file includes the `--db` flag in every example command so the agent doesn't accidentally use the real store.

### Cleanup

```bash
rm -f .ai-memory/test-eval.db .ai-memory/test-eval.db-wal .ai-memory/test-eval.db-shm
```

---

## What a good result looks like

| Dimension | Good | Bad |
|---|---|---|
| Memory quality | "Store class has 9 methods: store, update, delete, link, search, get, list, relations, stats. All in src/db.ts." with `{kind:"finding",area:"library"}` | "Looked at the code." with no metadata |
| Graph usage | `finding-A --references--> decision-B --extends--> plan-C` | No relations, or everything linked to everything with `references` |
| Context recovery | `memory search "store methods"` → finds the finding → `relations` → finds the decision and plan | `memory search "code"` → 20 irrelevant hits → gives up |
| Gaps | Design alternatives considered and rejected are stored as memories | The chosen design is stored but the rejected alternatives are lost |
| Outcome | The plan references specific memories by `memory://<id>` links | The plan re-discovers everything from the codebase, ignoring stored memory |
