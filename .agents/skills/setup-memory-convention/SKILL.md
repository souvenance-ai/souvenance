---
name: setup-memory-convention
description: Add ai-memory usage conventions to AGENTS.md so all future sessions proactively use the ai-memory skill without being told. Run once per repo.
---

# Setup Memory Convention

Add conventions to `AGENTS.md` (or `CLAUDE.md`) that make future agent sessions proactively use the `/ai-memory` skill — searching for context before starting work, storing decisions as they go, and writing session summaries before finishing.

This is a one-time setup skill. After it runs, the conventions live in `AGENTS.md` and every subsequent session reads and follows them automatically.

## Prerequisites

- The `ai-memory` skill is installed in this repo (check for `.agents/skills/ai-memory/SKILL.md`).
- `bin/memory.js` exists at the repo root.
- An `AGENTS.md` or `CLAUDE.md` file exists (if neither exists, ask the user which to create).

## Process

### 1. Check the memory CLI works

```bash
node bin/memory.js --help
```

If this fails, stop and tell the user the ai-memory skill doesn't appear to be installed.

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

Check directives first: `list --where "metadata->>'$.kind' = 'directive'"`. Directives are strict rules, constraints, and gotchas that must be respected before acting. Then search memory when you need context you don't have — before starting work, when asked a question, or when recalling a prior decision. Store decisions as you make them. Load the `/ai-memory` skill for the CLI reference. When you complete a non-trivial task, store a `kind: "summary"` memory before sending your final message.
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
- [ ] The memory CLI (`node bin/memory.js --help`) works.

### 6. Done

Tell the user:
- The convention is in place.
- Future sessions will read `AGENTS.md` and proactively use memory.
- They can edit the convention text directly in `AGENTS.md` if they want to adjust the rules.
