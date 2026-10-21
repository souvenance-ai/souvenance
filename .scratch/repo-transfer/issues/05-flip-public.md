# 05 — flip public after scrub verified

Status: ready-for-human (gated: bundled ask granted)
Type: task

Phase 3 includes "flip public after scrub verified" (arc objective `dcd9d55c`).

## Scrub evidence

- Phase-2 audit: full-history secret scan over 70 commits via `git log -p --all`
  — CLEAN (only a test fixture + a license line).
- Delta scan this phase over every commit after b20571e (the audit HEAD):
  to be run mechanically right before the flip (see spec sequencing).

## Flip (Valentin executes, or delegates with the bundled go)

- UI: Settings → General → Danger Zone → Change visibility → Public.
- API: `gh api -X PATCH repos/souvenance-ai/souvenance -F private=false`
  (needs repo admin at the destination org).

## Never

- memory.souvenance.org stays unlinked; the VPS mirror is not in this repo's
  references.
- Phase-1 stance holds: nothing consumer-facing until phase 4+ needs it.

## Resolution

(done — bundled ask)
