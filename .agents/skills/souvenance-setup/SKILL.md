---
name: souvenance-setup
description: Set up the souvenance agent memory in a project — install the CLI, create the store, mount it (MCP server or skill), adopt the memory conventions in AGENTS.md, and seed the store with an identity. Run once per project.
---

# Souvenance Setup

Get souvenance — persistent, searchable agent memory — running in a project, once. After this, every session orients from the store: directives first, decisions stored as they happen, summaries before finishing. The daily practice lives in the `souvenance` skill.

## 1. Install

Requires Node.js 24+ (the built-in `node:sqlite` module is the engine).

```bash
npm install -g @souvenance/cli    # or zero-install: npx @souvenance/cli --help
souvenance --help
```

One bin: `souvenance`. (Early releases ≤ 0.1.1 also installed a generic `memory` transition alias from the project's `ai-memory` era — removed in newer releases as too collision-prone on PATH; type `souvenance`.)

## 2. Create the store

The store is created on first write — no init command:

```bash
souvenance store "Memory started on $(date -I). Purpose: <one line>." --metadata '{"kind":"summary"}' --weight 0.9
souvenance stats        # first command creates .souvenance/memory.db too; this verifies
```

Gitignore it — one store per project, never committed:

```bash
echo '.souvenance/' >> .gitignore
```

## 3. Mount it in your agent

Pick the surface (all three speak the same verbs and return the same JSON shapes):

- **MCP — typed tools, any MCP client.** Best default: the memory becomes first-class tools, no skill needed.

  ```bash
  opencode mcp add souvenance -- souvenance mcp        # OpenCode (global install)
  ```

  Generic MCP client config: `{"mcp":{"servers":{"souvenance":{"type":"local","command":["souvenance","mcp"]}}}}`. The server instructions carry the recovery ritual — an agent is oriented at initialize without loading anything else.

- **Skill — the CLI via bash.** Copy [`souvenance/SKILL.md`](../souvenance/SKILL.md) (this repo's `.agents/skills/souvenance/`) into your project or agent's skill directory. Use this when your harness has skills but no MCP.

- **HTTP — cross-machine or multi-agent.** `souvenance serve` exposes the store over HTTP with token grants and one-call recovery (`GET /recover`). See the README section "HTTP server" in the [repository](https://github.com/souvenance-ai/souvenance).

## 4. Adopt the conventions

The memory only compounds if every session uses it without being told. Add to `AGENTS.md` (or `CLAUDE.md`) a persistent-memory section carrying these four rules, adapted to the file's voice:

1. **Check directives first** — `souvenance list --where "metadata->>'$.kind' = 'directive'" --limit 20`. Binding rules, respected before acting.
2. **Search when you lack context** — before starting work, when asked a question, when recalling a prior decision.
3. **Store decisions as they are made** — `kind: "decision"`, the what, the why, rejected alternatives; supersede when they change.
4. **Store a `kind: "summary"` before finishing** — and run `souvenance finish`; a relaunch recommendation is valid only once it reports healthy.

If a convention section already exists, verify and keep it — never duplicate.

## 5. Seed the identity

Ask the user: **"What kind of being do you want this agent to be?"** An open question — the answer may be a role, a personality, constraints, lore, or "just a generic agent with memory". Whatever they provide is the seed; do not judge, filter, or reframe it.

Store each element separately, one concept per memory:

- Constraints → `kind: "directive"` (binding; the recovery ritual loads them every session)
- Identity / personality / role → `kind: "identity"` or `kind: "lore"`
- Vocabulary / metaphors → `kind: "vocabulary"`
- Project context → `kind: "summary"` (what the project is, stack, current state)

Link the seeds together (`souvenance link <id1> <id2> --kind references`), then `souvenance stats` to show the seeded store. "Generic agent with memory" gets just the operational vocabulary and a brief project context — that is enough; the agent builds the rest through real work.

## 6. Verify

- `souvenance doctor` — clean (no findings).
- A full cycle works: `store` → `search` → `get`.
- The conventions block is present in `AGENTS.md` / `CLAUDE.md`.
- Next session recovers without being told: directives, summaries, open objectives.

## Keywords

souvenance, setup, install, npm, npx, mcp mount, skill install, AGENTS.md conventions, seed, identity, first time, new project, onboarding.
