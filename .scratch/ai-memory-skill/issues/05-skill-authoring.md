# Skill authoring (SKILL.md)

Type: task
Status: open
Blocked by: 04

## Question

Author the opencode skill at `.agents/skills/ai-memory/` so the agent knows when and how to use the memory.

**Scope:**

1. **SKILL.md** at `.agents/skills/ai-memory/SKILL.md`. Follow the conventions of existing skills in `.agents/skills/` (read 2-3 neighbors for the shape). Contents:
   - **Description**: when to use this skill (storing, retrieving, searching memories during a session).
   - **Invocation**: the CLI commands (reference `bin/memory.js`), with one-line examples.
   - **Domain vocabulary**: point to `CONTEXT.md` for terms (memory, relation, kind, memory link, search, frontier).
   - **Exploration pattern**: document the frontier loop — search by keyword → read matches → traverse relations → repeat with `LIMIT`. This is how an agent explores a large memory without loading the whole DB.

2. **Memory-link convention**: document the `memory://<id>` scheme and that the `get` command resolves these. Note that markdown links to external resources (http, file paths) are just authored text, not graph edges.

3. **Do not** duplicate the CLI reference or the domain glossary inside SKILL.md; link to them. The skill is the thin contract; the library and `CONTEXT.md` hold the detail.

**Acceptance**: a fresh agent reading SKILL.md knows what the skill does, when to reach for it, how to call each command, and how to explore a large memory. Matches the tone and structure of neighbor skills.
