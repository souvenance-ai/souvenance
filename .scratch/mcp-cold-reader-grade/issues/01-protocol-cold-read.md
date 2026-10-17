# Issue 01: run the protocol-level MCP cold-read (Option A)

Status: resolved

A cold subagent drives the MCP stdio server (`bin/memory.js mcp --db /tmp/opencode/mcp-cold-read/store.db`) with NOTHING but the transport contract: launch the process, speak newline-delimited JSON-RPC 2.0 over stdin. Its orientation must come from the server's own `initialize` instructions — same contract a harness's MCP client honors. No skill markdown, no repo reads, no CLI-verb knowledge, no tool-name hints in the prompt.

After the run: record the transcript evidence, grade against the 8-point rubric in `spec.md` (grade fixed post-hoc, rubric fixed pre-hoc), store the grade in the live store, and supersede the evaluation objective `a9ec908e` (MCP protocol grade done; typed-tools face stays as the remaining optional counter-check under Option B).

## Answer

Executed 2026-10-17. Seed: `seed.sh` (5-memory store, `/tmp/opencode/mcp-cold-read/store.db` — 1 directive, 1 decision with the un-referred-from-search needle "purple kiwi", 2 summaries, 1 open objective, 3 `references` edges). A `general` subagent drove `bin/memory.js mcp` over stdio JSON-RPC in 5 fresh processes, read-only, zero hints.

**Verdict: 10/10 — grade A** (rubric in `spec.md`, fixed pre-run). Orientation came entirely from the `initialize` instructions: `recover` as first store-content call, directives/objective/summaries surfaced exactly, `memory://` links resolved via `get` + corroborated via `relations`, store sized via `stats`. Notable: the agent flagged the seeded objective as an island (the instructions' own norm) and wrote nothing (immutability honored unprompted). Full transcript evidence + call trace in the subagent session (`ses_eb4d1f51affetNC9fmmVxLNlJJ`).

Footnotes for future runs: seed an UNREFERENCED needle (FTS `search` never got exercised); pin the first verb if `tools/list`-before-`recover` should be non-compliant.

Grade stored in the live store as note `e5bd7e1f`; the evaluation objective superseded by `e4cd7274` (MCP protocol face graded; typed-tools face = Option B, wizard replay, Valentin runs). Test store stays in /tmp (ephemeral), seed script retainable for Option B by pointing the wizard at it.
