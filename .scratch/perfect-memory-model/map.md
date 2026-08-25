## Destination

An addition-only memory model for the ai-memory skill: content is immutable, destructive operations (update content, delete) are replaced with status transitions (supersede, deprecate, merge), and search/list default to active memories only.

## Notes

- Domain: ai-memory skill (`bin/memory.js`, `src/db.ts`, `src/migrations.ts`, `src/types.ts`, `.agents/skills/ai-memory/SKILL.md`, `CONTEXT.md`)
- Skills to consult: `domain-modeling` for glossary updates, `writing-for-agents` for SKILL.md edits
- Status is a first-class column on `memories`, not metadata
- Status values: `active` (default), `superseded`, `deprecated`, `merged`
- Content is immutable: `update --content` removed; `update --metadata` kept for status transitions and tag changes
- `delete` kept behind `--force` flag; deprecate is the default path

## Decisions so far

- [Status storage](01-schema-migration-status-column): First-class `status` column on `memories` table, not metadata. Values: `active`, `superseded`, `deprecated`, `merged`.
- [Content immutability](02-supersede-command): `update --content` removed. Content is never overwritten. Revisions done via `supersede` (store new + link + mark old). `update --metadata` kept for status/tags.
- [Delete behavior](03-deprecate-command): `deprecate` is the default soft-delete. `delete` kept behind `--force` flag as escape hatch.
- [Merge shape](04-merge-command): New atomic CLI command. Accepts N ids (2+). Stores merged memory, links originals with `merges` kind, marks originals as `merged`.
- [Search/list defaults](05-search-list-default-to-active): `search`, `list`, `tags` default to `active` only. `--all` flag opts into full history. `stats` gains `active_memories` and `memories_by_status`.
- [Supersede shape](02-supersede-command): Single atomic command `supersede <old-id> --content "..." [--metadata ...]`. Old relations stay as-is; new memory starts clean. `supersedes` edge is the only bridge.
- [Get on superseded](02-supersede-command): `get` returns memory as-is with its status. No auto-redirect. Agent follows `supersedes` edge manually.
- [Merge relation re-pointing](04-merge-command): Originals' relations stay as-is. Merged memory starts clean. `merges` edges are the bridge.

## Not yet specified

## Out of scope

### Future ideas / improvements

- Version chains: `memory history <id>` to walk the supersedes chain and show full evolution
- Auto-compaction: an agent-facing command that finds superseded/merged memories and offers to physically delete old ones to reclaim space
- `memory://` link resolution policy: should `get` on a `memory://` link follow supersedes edges to the current version?
- Status-based ranking in FTS5: should active memories rank higher than superseded ones in search results (when `--all` is used)?
- Draft status for in-progress memories that aren't ready for other sessions to find
