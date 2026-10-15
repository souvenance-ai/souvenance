# 02-cli-and-skill-guidance

Type: task
Status: resolved

## Question

Expose resolution at the CLI and teach the skill to use it, so frontier walkers can hop the bridge without library access.

### Requirements

**CLI** (`bin/memory.js`):

- `memory relations <id> [--direction out|in|both] [--resolved]` passes `resolve: true` to the Store.
- `--resolved` joins the boolean-flag set (no value expected).
- HELP lines and Notes updated to describe the annotation in one clause.
- Output shape: same JSON array as today, with optional `resolved_to` per row.

**Skill** (`.agents/skills/ai-memory/SKILL.md`):

- The CLI reference gains the flag on the `relations` entry.
- The frontier-loop guidance gains one sentence: when a relation lands on a superseded/merged memory, `--resolved` yields the current version; the raw row still shows `to_id` and the agent may still resolve manually.

### Answer

Done as specced (2026-10-15).

- `bin/memory.js`: `--resolved` added to `BOOLEAN_FLAGS`; `relations` case passes `resolve: true` when present. HELP command block gains the flag plus a one-clause description; Notes gains a two-line explanation (annotation only, raw rows unchanged).
- End-to-end smoke on a throwaway store (`/tmp`): default `relations` prints the raw row; `--resolved` prints the same row plus `resolved_to` = the superseding id. Matches library output shape.
- `.agents/skills/ai-memory/SKILL.md`: `relations` CLI entry gains `--resolved` in both the command list and `--direction` usage line; the status-semantics paragraph in "Evolving memories" now carries the annotation semantics (single source: the manual-follow protocol is unchanged, the flag is the shortcut); the frontier-loop step 3 names the flag as the hop when an edge lands on a stale target. Skill stays under ~200 lines.
