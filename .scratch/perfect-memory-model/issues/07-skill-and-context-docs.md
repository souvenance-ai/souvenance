# 07-skill-and-context-docs

Type: task
Status: closed

## Question

Update `SKILL.md`, `CONTEXT.md`, and CLI `--help` to document the addition-only memory model.

### Requirements

**SKILL.md** (`.agents/skills/ai-memory/SKILL.md`):

- Add a new section "## Evolving memories (addition-only model)" explaining:
  - Content is immutable — never overwrite a memory
  - To revise a decision: `supersede <old-id>` — stores the new version, links old→new, marks old as `superseded`
  - To soft-delete: `deprecate <id>` — marks as `deprecated`, hidden from default search/list
  - To combine duplicates: `merge <id1> <id2> ... --content "..."` — stores a merged memory, marks originals as `merged`
  - `search` and `list` default to active memories only; use `--all` to see history
  - `get` always returns the memory as-is (including its status); follow `supersedes`/`merges` edges to find the current version
- Update the "Writing good memories" section to mention that corrections are done via supersede, not re-store
- Update CLI examples section with the new commands

**CONTEXT.md** (`CONTEXT.md`):

- Add glossary entries for:
  - **Status**: The lifecycle state of a memory: `active`, `superseded`, `deprecated`, `merged`. Determined by the addition-only model — memories are never overwritten or deleted, only superseded, deprecated, or merged.
  - **Supersede**: Store a new version of a memory and mark the old one as `superseded`. The old memory's content is preserved; a `supersedes` relation links old to new.
  - **Deprecate**: Mark a memory as `deprecated`, removing it from default search/list results without deleting it. The soft-delete equivalent of `delete`.
  - **Merge**: Combine two or more duplicate memories into a single new memory. Originals are marked `merged`; a `merges` relation links each original to the merged result.

**Tests:**

- Update existing tests that use `update` with `--content` (if any) to use `supersede` instead
- Add tests for the new commands (supersede, deprecate, merge)
- Add tests for default active-only filtering on search/list/tags
- Add tests for `--all` flag

### Blocked by

05-search-list-default-to-active, 06-cli-surface-changes
