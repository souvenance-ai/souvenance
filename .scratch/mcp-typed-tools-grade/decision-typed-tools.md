# Decision: Option B graded by an agent-run headless harness (2026-10-17)

Valentin delegated the queue choice ("je te laisse choisir"). DECIDED: grade the MCP TYPED-TOOLS face (Option B of the cold-reader protocol) NOW, agent-run, instead of waiting for Valentin's interactive wizard replay. Basis: OpenCode v2 (v2.0.32 installed) mounts a local stdio MCP server under Code Mode — typed tools grouped as tools.<server>.<tool> — and injects the server's initialize instructions into the system prompt (docs opencode.ai/v2/docs/mcp-servers). `opencode run --standalone` is a REAL harness session in a clean project directory: cold agent, fresh session, self-discovery of the tool names. The graded conditions differ from the wizard replay only by removing the human; the agent-facing surface (typed catalog + injected instructions) is identical.

Protocol purity is CONFIG-ENFORCED, not prompt-asked: a project opencode.json denies shell/edit/read/glob/grep/webfetch/websearch/subagent/skill/external_directory/question plus the six memory write verbs (memory_store/supersede/merge/update/delete/deprecate), naming the mounted server "memory" pointing at the seeded store. A read-only cold face with a stronger guarantee than run A's honor system.

The seeded store keeps the 5-memory shape of the protocol run but the decision needle is now UNREFERENCED (the run-A footnote: FTS search must actually fire). Valentin's wizard replay remains open as an optional human counter-check, not a gate.

Alternatives rejected: (1) wait for Valentin's interactive replay — the queue stalls for nothing, the harness replicates the conditions; (2) skip Option B — the evaluation objective explicitly hangs it as the remaining typed face.

Keywords: decision, option B, typed-tools, MCP, cold-reader, grade, headless, opencode run, standalone, codemode, permissions, config-enforced, purity, unreferenced needle, FTS, sandbox, /tmp/opencode/mcp-typed-tools.
