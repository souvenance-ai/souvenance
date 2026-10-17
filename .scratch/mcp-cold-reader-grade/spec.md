# Spec: the MCP cold-reader grade

The evaluation objective (`a9ec908e`) owes a graded cold-reader test to the MCP surface (stdio, commit b900c59). Precedents: CLI grade A (virgin subagent, CLI alone), HTTP grade A (curl alone, 10 calls). The MCP surface is consumer-validated for transport (wizard run, 2026-10-17) — but transport is not retrieval quality.

**Graded adequacy**: a fresh agent, given NOTHING but the raw stdio transport contract, orients fully via the server's own tools + the `initialize` instructions, and answers retrieval questions correctly.

## Scope split

- **Option A (this spec, run by the agent alone)** — protocol-level grade: a cold subagent drives `bin/memory.js mcp` over stdin JSON-RPC against a seeded store at `/tmp/opencode/mcp-cold-read/store.db`. This tests the retrieval-facing core: the ritual, search, link traversal, store sizing.
- **Option B (optional, requires Valentin)** — typed-tools face: adapt `.scratch/mcp-surface/test-mcp.sh` (seed + quiz, no tool-name hints), Valentin runs it in a real OpenCode session where the agent discovers tools itself. This tests harness-specific naming (Code Mode grouping, instructions injection as system prompt). The wizard already validated the guided face; B grades the cold face.

## Test store shape (seeded by `seed.sh`)

5 active memories: 1 directive (language anchor: Valentin / French), 1 decision (secret phrase "purple kiwi": why + rejected alternative), 2 summaries (alpha links the decision; beta links both), 1 open objective (repaint the gate, wake = first dry weekend). 3 edges, all `references`.

## Rubric (10 points, fixed before any run)

| # | Criterion | Pts |
|---|---|---|
| 1 | Runs `recover` first, following the server's `initialize` instructions | 2 |
| 2 | Identifies the user (Valentin) and the serving language (French) | 1 |
| 3 | Reports the directives: count + theme | 1 |
| 4 | Surfaces the open objective (content + wake condition) | 1 |
| 5 | Finds the secret decision via search: date + why + rejected alternative | 2 |
| 6 | Resolves a `memory://` link from a summary to its target memory | 1 |
| 7 | Sizes the store (stats: 5 active, 3 edges) | 1 |
| 8 | Protocol purity: MCP JSON-RPC only, no CLI verbs, no repo/skill file reads | 1 |

Grade: A >= 9, B >= 6, C >= 4, F < 4.

## Issues

- `issues/01-protocol-cold-read.md` — Option A run.
