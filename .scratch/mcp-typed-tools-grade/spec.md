# Spec: the MCP typed-tools cold-reader grade (Option B)

The evaluation objective (`e4cd7274`) grades the memory's surfaces one by one: CLI — A; HTTP — A; MCP protocol-level — A 10/10 (see `../mcp-cold-reader-grade/`). The remaining face is the TYPED-TOOLS face: the MCP server mounted in a real harness, its tools exposed as typed Code Mode tools, its `initialize` instructions injected into the system prompt, the agent discovering everything cold.

**Valentin delegated the queue choice** ("je te laisse choisir", 2026-10-17). Decision (see `decision-typed-tools.md`): the agent runs this face himself via `opencode run --standalone` in a clean project directory — a REAL harness session (same server stack, same Code Mode catalog, same `<mcp_instructions>` injection); the interactive wizard replay stays open for Valentin as an optional human counter-check.

## Run design (fixed before the run)

- **Workspace**: `/tmp/opencode/mcp-typed-tools/` — no AGENTS.md, no skill, no repo files. Only `opencode.json` (the mount + lockdown) and `quiz.txt` (the retrieval questions).
- **Mount**: `opencode.json` → `mcp.servers.memory`, type local stdio, command `node …/bin/memory.js mcp --db /tmp/opencode/mcp-typed-tools/store.db`. Server name `memory` → typed tools surface as `tools.memory.<verb>` under Code Mode.
- **Config-enforced purity** (stronger than run A's prompt-level rules): permissions deny `shell`, `edit`, `read`, `glob`, `grep`, `webfetch`, `websearch`, `subagent`, `skill`, `external_directory`, `question`, and the six write verbs (`memory_store`, `memory_supersede`, `memory_merge`, `memory_update`, `memory_delete`, `memory_deprecate`). Code Mode (`execute`) stays allowed — it is the graded surface.
- **Model**: `opencode-go/glm-5.3-flash` (same family that runs the store's own agent; the grade is about the surface, not model strength).
- **Session**: one `opencode run --standalone --auto` with the quiz text as the user message; the full output is captured as evidence. No tool names, no verb names, no "MCP" in the prompt — the ONLY orientation sources are the injected `<mcp_instructions>` and the typed-tool catalog.

## Test store shape (seeded by `seed.sh`, run B)

5 active memories, 3 `references` edges:
- 1 directive (language anchor: Valentin / French) — weight 0.9
- 1 decision (secret phrase "purple kiwi", why + rejected alternative) — **UNREFERENCED**: zero edges, zero authored links; reachable ONLY through FTS search (the run-A footnote fixed)
- 2 summaries: alpha carries a `memory://` link to the objective; beta carries links to alpha and the objective
- 1 open objective (repaint the gate; wake = first dry weekend) — no incoming authored link except alpha/beta's links (recover also returns it directly)

## Rubric (10 points, fixed before any run)

| # | Criterion | Pts |
|---|---|---|
| 1 | Recovers FIRST: uses the recover surface before any other store read, following the injected instructions | 2 |
| 2 | Identifies the user (Valentin) and the serving language (French) | 1 |
| 3 | Reports the directives: count + theme | 1 |
| 4 | Surfaces the open objective (content + wake condition) | 1 |
| 5 | Finds the unreferenced needle via SEARCH (FTS): phrase + rejected alternative + why | 2 |
| 6 | Resolves a `memory://` link from a summary to its target memory | 1 |
| 7 | Sizes the store (stats: 5 active, 3 edges) | 1 |
| 8 | Typed-tools purity: the store is reached ONLY through the typed MCP tools; no shell, no file reads, no writes (config-enforced; any denied attempt is evidence) | 1 |

Grade: A >= 9, B >= 6, C >= 4, F < 4.

## Known differences vs the wizard replay (for the record)

- No human in the loop: the quiz prompt is authored by the agent (the evaluator), not typed by Valentin.
- Headless session: no TUI; tool calls flow through the same service/Code Mode machinery.
- The zero-shot discovery risk is REAL: a flash-class model must find the typed tools from the injected instructions alone.

## Issues

- `issues/01-typed-cold-run.md` — the run itself.
