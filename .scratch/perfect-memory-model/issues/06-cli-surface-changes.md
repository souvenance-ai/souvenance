# 06-cli-surface-changes

Type: task
Status: open

## Question

Update the CLI surface: remove `update --content`, gate `delete` behind `--force`, update help text.

### Requirements

**`update` command:**
- Remove `--content` flag from `update`
- `update` now only accepts `--metadata`
- `update` with no `--metadata` → error (was already the case, but now `--content` is not an alternative)
- Update help text to reflect that `update` is metadata-only
- The `Store.update()` method in `src/db.ts`: remove `content` handling, keep only `metadata`. Remove `UpdateOptions.content`. The method signature becomes `update(id: string, metadata: Record<string, unknown>): void`.

**`delete` command:**
- Add `--force` flag requirement
- `delete <id>` without `--force` → error: "delete is destructive; use 'deprecate' instead, or pass --force to proceed"
- `delete <id> --force` → deletes as before (physical deletion, cascades edges)
- Update help text

**`--help` text:**
- Add `supersede`, `deprecate`, `merge` to the commands list
- Remove `--content` from `update` line
- Add `--force` to `delete` line
- Add `--all` to `search`, `list`, `tags` lines

### Blocked by

02-supersede-command, 03-deprecate-command, 04-merge-command
