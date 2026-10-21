# 05 — flip public after scrub verified

Status: ready-for-human (gated: bundled ask granted)
Type: task

Phase 3 includes "flip public after scrub verified" (arc objective `dcd9d55c`).

## Scrub evidence

- Phase-2 audit: full-history secret scan over 70 commits via `git log -p --all`
  — CLEAN (only a test fixture + a license line).
- Delta scan this phase over every commit after b20571e (the audit HEAD):
  to be run mechanically right before the flip (see spec sequencing).

## Flip (executed)

- `gh api -X PATCH repos/souvenance-ai/souvenance -F private=false` →
  `{"visibility":"public"}` (2026-10-21, bundled ask granted).
- Manual fallback (superseded): nothing needed.

## Never

- memory.souvenance.org stays unlinked; the VPS mirror is not in this repo's
  references.
- Phase-1 stance holds: nothing consumer-facing until phase 4+ needs it.

## Resolution

DONE (2026-10-21). Scrub verified: phase-2 full-history scan clean + delta scan
`git log -p b20571e..HEAD` clean (only audit-prose lines and the test fixture;
the `SECRET =` grep lines are removals of the old raw-hex fixture — refactor to
the souv- pattern). Bookkeeping pushes to main ride the same granted ask.
