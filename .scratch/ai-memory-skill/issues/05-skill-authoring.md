# Skill authoring (SKILL.md)

Type: task
Status: resolved
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

## Answer

Done. Created `.agents/skills/ai-memory/SKILL.md`.

**What was built:**

- **SKILL.md** with standard frontmatter (`name`, `description`) following the conventions of neighbor skills (e.g. `research`, `prototype`, `tdd`): `---`-fenced frontmatter, then content sections.

- **Description** (frontmatter): covers when to reach for the skill — storing, retrieving, searching, and exploring memories across sessions.

- **When to use this skill**: four bullets (storing, retrieving, searching, exploring) matching the ticket's scope.

- **Domain vocabulary**: points to `CONTEXT.md` at the repo root for the canonical glossary (memory, content, metadata, relation, kind, memory link, search, frontier, store). Does not restate the definitions.

- **CLI**: one-line examples for all 9 commands, followed by `memory --help` as the pointer to the full reference. Does not duplicate the help text. Documents the output contract (stdout/stderr/exit) and the `--db` flag in one line each.

- **Memory links**: documents the `memory://<uuid>` scheme, that `get` resolves them, and that external markdown links (http, file paths) are authored text, not graph edges. States the link-vs-relation distinction.

- **Exploration: the frontier loop**: the four-step loop (search → read → traverse relations → repeat with `LIMIT`), matching the ticket's exploration pattern requirement.

- **Conventions**: store location, UUID v4 ids, WAL mode, migrate-on-open, and the deep-module note (library is the deep module; skill is the thin contract).

**Design decisions:**
- CLI section uses one-line examples and points to `--help` rather than restating the full command reference — per the ticket's "do not duplicate" instruction.
- Domain glossary is linked, not restated — per the same instruction.
- The skill file is ~80 lines; concise enough for a fresh agent to load and act on.

**Verification:**
- `yarn typecheck`: clean (0 errors).
- `yarn test`: 51/51 pass (unchanged; this ticket adds no code, only documentation).

**Facts later tickets depend on:**
- The skill lives at `.agents/skills/ai-memory/SKILL.md`.
- It documents the CLI, the memory-link convention, and the frontier exploration loop.
- It links to `CONTEXT.md` for vocabulary and `--help` for the full CLI reference.
