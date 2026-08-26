# Map: Export Command

## Destination

A `memory export` CLI command, for humans only, that writes the entire store as a flat directory of navigable markdown files: one `.md` per memory with YAML frontmatter (id, kind, tags, status, created_at), `memory://` links rewritten to relative file links, a `## Relations` section linking to related memory files, and no index file. The export is idempotent, respects `--db` and `--output`, and covers all statuses by default.

## Notes

**Domain**: ai-memory skill (`bin/memory.js`, `src/db.ts`, `src/migrations.ts`, `src/types.ts`, `CONTEXT.md`). See `CONTEXT.md` for the glossary (memory, relation, kind, memory link, status, store).

**Skills every session should consult**: `implement` or `implement-spec` for the build tickets; `domain-modeling` if terms shift; `tdd` if tests are wanted alongside.

**Standing preferences**:
- Humans-only command: not referenced in SKILL.md, no agent workflow built around it.
- Flat directory output (no subdirs by kind or date).
- File naming: `<uuid-prefix>-<slug>.md` (slug from content; UUID prefix guarantees uniqueness).
- YAML frontmatter for metadata; `## Relations` section for graph edges.
- `memory://<uuid>` links in content rewritten to relative `./<file>.md` links; broken links (target not in store) left as-is or noted.
- All statuses exported by default (full history).
- `--output <dir>` flag (default `.ai-memory/export/`); `--db` respected as in all commands.
- No index/README file — flat dir, human browses with their file browser.
- Idempotent: re-export to same dir overwrites cleanly.

**Design choices already made (from grilling)**:
- File naming: UUID prefix + slug
- Directory structure: flat
- Metadata/relations: frontmatter + Relations section
- Index: none
- Output: `--output <dir>` flag

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

_None yet — map just charted._

- [Slug generation](issues/01-slug-generation.md): First sentence of content (or header if present), 50 chars max, NFD-normalized kebab-case. Edge cases: empty→`empty`, symbols-only→`untitled`. Filename: `<uuid8>-<slug>.md`.
- [Store export API](issues/02-store-export-api.md): One `dump()` method on Store returning lazy iterators `{ memories, edges }`. Not export-specific, JSDoc'd as not stable API. CLI materializes edges into a Map, streams memories one at a time.
- [Markdown rendering](issues/03-markdown-rendering.md): Frontmatter lifts `kind`/`tags` to top-level, nests remaining metadata under `metadata:`. Links rewritten to `[slug](./file.md)`. Relations grouped by outgoing/incoming with arrows. Empty relations section omitted.

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

_None — all open questions have been ticketed._

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->

- **Agent-facing export / SKILL.md integration.** Export is humans-only; no agent workflow or skill documentation for it.
- **Import / round-trip.** This is export-only; no `import` command to rehydrate a store from markdown files.
- **Incremental / diff export.** v1 is full export every time. Incremental sync is a later optimization.
- **Custom templates / theming.** One fixed markdown format; no user-customizable templates.
- **Streaming / NDJSON output.** Files are written directly to disk; no stdout streaming for export.
