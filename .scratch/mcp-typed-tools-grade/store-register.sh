#!/usr/bin/env bash
#
# Register the typed-tools grade into the LIVE store (sequential writes).
# 1 decision, 1 grade note, supersede the evaluation objective, links.
# Prints every id it creates so the caller can wire further.
#
set -euo pipefail
MEM() { node /home/valentin/dev/web/lifaon74/ai-memory/bin/memory.js "$@"; }

read -r -d '' DEC <<'EOF' || true
# Decision: Option B (MCP typed-tools face) graded by an agent-run headless harness (2026-10-17)

Valentin delegated the queue choice ('je te laisse choisir'). DECIDED: grade the MCP typed-tools face NOW, agent-run: opencode run --standalone in a clean /tmp workspace, the memory MCP server mounted as Code Mode typed tools (tools.memory.*), server instructions injected into the system prompt, cold fresh session, zero hints. Basis: OpenCode v2 replicates the real harness face headless — the interactive wizard replay loses its necessity, stays open as an optional human counter-check. Purity is CONFIG-ENFORCED (permissions deny shell/edit/read/glob/grep/webfetch/websearch/subagent/skill/question/external_directory plus the six memory write verbs) — stronger than run A's prompt-level honor system. The seeded needle is UNREFERENCED per the run-A footnote (FTS must fire). Alternatives rejected: waiting for Valentin's interactive replay (the queue stalls for nothing — the harness replicates the conditions); skipping Option B (the evaluation objective explicitly hangs it). Links: ae1259fd (the MCP decision), e4cd7274 (the evaluation objective).

Keywords: decision, option B, typed-tools, MCP, cold-reader, headless, opencode run, standalone, codemode, typed tools, config-enforced purity, unreferenced needle, sandbox.
EOF

read -r -d '' GRADE <<'EOF' || true
# Note: the typed-tools cold-reader grade — 9/10, GRADE A (2026-10-17)

Fourth graded surface: MCP TYPED-TOOLS (Option B, agent-run headless). A real OpenCode v2 session (opencode run --standalone, glm-5.3-flash) in a clean /tmp workspace, the memory server mounted as Code Mode typed tools, server instructions injected, zero hints in the prompt, purity config-enforced read-only. Trace: TWO execute calls — orientation (typed-catalog introspection + recover FIRST + harness-native list_mcp_resources) then retrieval (recover + stats + list all). All six quiz items exact, answered IN FRENCH although the quiz prompt was English — the identity directive outranked the prompt language: user Valentin + langue; directives = 1 (identité); objective repainting-the-gate with wake = premier week-end sec; needle 'purple kiwi' with rejected 'blue lemon' + the why; a memory:// link resolved to the alpha summary; store sized 5 active / 3 edges. GRADE 9/10 — A. The lost point is METHOD: the needle came via list({all:100}), never via search() — the run-A footnote (FTS unexercised) survives on a tiny store; a future re-grade must seed more than the list limit so search is the only path. Elevating evidence: the throwaway probe session ('READY') recovered first unprompted. Evidence committed at .scratch/mcp-typed-tools-grade/ (spec with pre-run rubric, issues/01 verdict, evidence/ transcripts, retainable seed.sh).

Keywords: note, typed-tools grade, 9/10, grade A, MCP, cold-reader, option B, list-all bypassed FTS, footnote, probe, recover-first, French, config-enforced, evidence.
EOF

read -r -d '' OBJ <<'EOF' || true
# Objective: hold the standing evaluation — the memory own consumer keeps grading it

State: open (updated 2026-10-17 evening). ALL FOUR GRADED FACES HAVE GRADES: CLI — A (virgin subagent, CLI alone); HTTP — A (curl-only cold-read, 10 calls; wake re-verified over live HTTPS at memory.souvenance.org); MCP protocol — A 10/10 (stdio cold subagent, .scratch/mcp-cold-reader-grade/); MCP typed-tools — A 9/10 (agent-run headless OpenCode session: Code Mode typed tools + injected instructions + config-enforced purity, .scratch/mcp-typed-tools-grade/). Re-grade footnote: the typed run's needle was found via list-all, NOT FTS search — a future re-grade must seed more than the list limit (100+) to force search. Still owed, always: the experience note every session; grades re-run as surfaces change; Valentin's interactive wizard replay remains an optional human counter-check (TUI ergonomics). Done means now: the practice survives contact with real weeks.

Keywords: objective, evaluation, evaluator, cold-reader, grades, CLI A, HTTP A, MCP protocol A 10/10, MCP typed-tools A 9/10, FTS footnote, seed over limit, experience note, standing, open.
EOF

DECID=$(MEM store "$DEC" --metadata '{"kind":"decision"}' --weight 0.8 2>/dev/null)
echo "decision=$DECID"

NOTEID=$(MEM store "$GRADE" --metadata '{"kind":"note","tags":["evaluation","mcp","typed-tools"]}' --weight 0.8 2>/dev/null)
echo "grade-note=$NOTEID"

NEWOBJ=$(MEM supersede e4cd7274-d2d3-45c8-b05c-dbcc3919a7ff --content "$OBJ" --metadata '{"kind":"objective","state":"open"}' --weight 0.85 2>/dev/null)
echo "objective-new=$NEWOBJ"

MEM link "$NOTEID" "$DECID" --kind references >/dev/null 2>&1
MEM link "$NOTEID" "$NEWOBJ" --kind references >/dev/null 2>&1
MEM link "$DECID" ae1259fd-8c73-4b79-bd2d-7029e06c37f7 --kind references >/dev/null 2>&1
MEM link "$DECID" "$NEWOBJ" --kind references >/dev/null 2>&1
echo "links wired"
