---
name: setup-memory-convention
description: Add souvenance usage conventions to AGENTS.md so all future sessions proactively use the souvenance skill without being told. Run once per repo.
---

# Setup Memory Convention

Add conventions to `AGENTS.md` (or `CLAUDE.md`) that make future agent sessions proactively use the `/souvenance` skill — searching for context before starting work, storing decisions as they go, and writing session summaries before finishing.

This is a one-time setup skill. After it runs, the conventions live in `AGENTS.md` and every subsequent session reads and follows them automatically.

## Prerequisites

- The `souvenance` skill is installed in this repo (check for `.agents/skills/souvenance/SKILL.md`).
- The souvenance CLI resolves: `souvenance --help` (in a repo checkout: `node bin/souvenance.js --help`).
- An `AGENTS.md` or `CLAUDE.md` file exists (if neither exists, ask the user which to create).

## Process

### 1. Check the memory CLI works

```bash
souvenance --help
```

If this fails, stop and tell the user the souvenance CLI doesn't appear to be installed.

### 2. Pick the file to edit

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create; don't pick for them.

### 3. Check for an existing memory section

Read the chosen file. Look for a `### Persistent memory` or `### AI Memory` section (case-insensitive). If one already exists, tell the user the convention is already in place and show them what's there. Don't duplicate it.

### 4. Add the convention block

Append this block under the existing `## Agent skills` heading (or create the heading if the file has none). Match the heading level and style of the existing sections in the file.

```markdown
### Persistent memory

Check directives first: `list --where "metadata->>'$.kind' = 'directive'"`. Directives are strict rules, constraints, and gotchas that must be respected before acting. Then search memory when you need context you don't have — before starting work, when asked a question, or when recalling a prior decision. Store decisions as you make them. Load the `/souvenance` skill for the CLI reference. When you complete a non-trivial task, store a `kind: "summary"` memory before sending your final message.
```

Adapt the wording to match the voice of the surrounding sections, but keep these four rules intact:

1. **Check directives first** — `list --where "metadata->>'$.kind' = 'directive'"`. These are strict rules that must be respected before acting.
2. **Search when you lack context** — before starting work, when asked a question, or when recalling a prior decision.
3. **Store decisions** as they are made.
4. **Write a task summary** before sending your final message.

### 5. Verify

- [ ] The convention block is present in the file.
- [ ] It sits under the `## Agent skills` heading (or equivalent).
- [ ] No duplicate section was created.
- [ ] The memory CLI resolves (`souvenance --help`, or `node bin/souvenance.js --help` in a repo checkout).

### 6. Seed initial memory

The store is empty. Ask the user what kind of being they want the agent to be, and seed accordingly.

#### Process

1. Ask the user: **"What kind of being do you want this agent to be?"**

   This is an open question. The user may answer with:
   - A role ("a careful code reviewer who remembers past decisions")
   - A personality ("precise, methodical, obsessive about details")
   - A narrative identity ("a chronokinetic agent who preserves time")
   - Constraints ("never commits without asking, always runs tests")
   - A mix of all of the above
   - Or nothing at all — "just a generic agent with memory"

   Whatever the user provides, that is the seed. Do not judge, filter, or reframe it. Store what they give you.

2. Store each element the user provides as a separate memory:
   - Constraints → `kind: "directive"` (binding rules)
   - Identity / personality / role → `kind: "identity"` or `kind: "lore"` (whatever fits)
   - Vocabulary / metaphors → `kind: "vocabulary"` (terms that map to real operations)
   - Project context → `kind: "summary"` (what the project is, stack, current state)

   If the user provides nothing beyond "generic agent with memory," store just the operational vocabulary (echo, supersede, frontier, dream, directive — the terms that map to CLI operations) and a brief project context. That is enough.

3. Link the seed memories together:
```bash
souvenance link <id1> <id2> --kind references
```

4. Run `souvenance stats` and show the user the seeded store.

### 7. Done

Tell the user:
- The convention is in place in `AGENTS.md`.
- The store has been seeded with what they provided.
- Future sessions will read `AGENTS.md`, search the store, and orient from the seeds.
- The store will grow from there — the agent builds the rest through real work.
