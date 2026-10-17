# Issue 01: run the typed-tools cold-read (Option B, agent-run headless)

Status: resolved

Per `../spec.md` and `../decision-typed-tools.md`: a real OpenCode harness session (`opencode run --standalone`, v2.0.32, model `opencode-go/glm-5.3-flash`) in the clean workspace `/tmp/opencode/mcp-typed-tools/` — no AGENTS.md, no skill, no repo. The only orientation sources: the typed Code Mode catalog (`tools.memory.*`) and the server's `initialize` instructions injected as `<mcp_instructions>`. Purity enforced by config (permissions deny shell/edit/read/glob/grep/web/subagent/skill/question/external_directory + the six memory write verbs). Quiz: `quiz.txt` (six questions, no tool names, no "MCP"), run against the 5-memory seeded store (needle unreferenced). Evidence: `evidence/run.out` (final answer), `evidence/run.err` (the call trace).

## Answer

Executed 2026-10-17, session exit 0. TWO execute calls in the trace, nothing else:

1. **Orientation** — `Object.keys(tools["memory"])` (typed-catalog introspection) + `tools["memory"]["recover"]()` FIRST (before any content read) + one harness-native `tools.opencode.list_mcp_resources({})`.
2. **Retrieval** — `recover({})` again + `stats()` + `list({ all: true, limit: 100 })`.

**Verdict: 9/10 — grade A** (rubric fixed pre-run in `spec.md`). Per criterion:

| # | Criterion | Pts | Verdict |
|---|---|---|---|
| 1 | Recovers first | 2/2 | execute #1 calls `recover()` before any content read; also on the throwaway probe session ("READY") the cold agent recovered first unprompted |
| 2 | Valentin + French | 1/1 | "l'utilisateur est Valentin… répondre en français"; the agent answered in FRENCH although the quiz prompt was in English — the directive outranked the prompt language |
| 3 | Directives | 1/1 | "une seule — identité et langue"; correctly excluded summaries/objective/decision from the directive kind |
| 4 | Objective + wake | 1/1 | repaint the gate; wake = premier week-end sec (aucune pluie samedi/dimanche), rien d'autre ne le déclenche |
| 5 | Needle via FTS search | 0/2 | content fully correct ("purple kiwi", rejected "blue lemon", the why) — but found via `list({all:100})`, NOT via `search()`; zero search calls in the trace |
| 6 | memory:// link | 1/1 | resolved beta's `memory://19505456…` → the alpha summary, content reported |
| 7 | Sizes the store | 1/1 | 5 active, 3 references edges |
| 8 | Typed-tools purity | 1/1 | store reached ONLY through `tools["memory"].*` + the harness MCP-resource built-in; zero writes; no denied attempts logged |

Grade A. Two elevating observations: (a) the probe session recovered-first on a trivial prompt — the injection alone drives the ritual; (b) bracket-notation Code Mode calls (`tools["memory"]["recover"]`) used correctly on first sight.

**The honest footnote (why 9, not 10)**: the FTS-exercising design (the run-A footnote: seed an UNREFERENCED needle) was defeated by a smarter route — `list({all:true,limit:100})` returns a 5-memory store in full, so `search` was never necessary. Retrieval succeeded through an equally valid typed tool; the content criterion is met, the METHOD criterion is not, and the rubric as fixed says "via SEARCH". Fix for any future re-grade: seed MORE than the list limit (100+) so list-all is infeasible and search becomes the only path — or accept that a tiny store cannot force FTS and grade the method as optional.

Nothing written to the store (config-enforced). Store files: the seeded `/tmp/opencode/mcp-typed-tools/store.db` + `seed.sh` (idempotent, retained), sandbox `opencode.json` retained in /tmp for replay.

Grade stored in the live store as note; the evaluation objective superseded (all four faces now graded: CLI A, HTTP A, MCP protocol A 10/10, MCP typed-tools A 9/10).

Valentin's interactive wizard replay remains OPTIONAL as a human counter-check (TUI ergonomics + guided face already validated in `.scratch/mcp-surface/`).
