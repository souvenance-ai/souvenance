# 01 — the dream_debt hint names a verb that does not exist

Type: task
Status: ready-for-agent
Filed by: the cold CLI contract test of PR #8 (single-write-graph arc, 2026-10-21)

## Observed cold behavior

The cold subagent hit the dream_debt warn in `finish` and probed
`dream` as a verb — refused (`error: unknown command: dream` + help
dump). Its report:

> The dream debt names thresholds and hints "dream" but no dream verb
> exists on this surface — the ritual points outside the tool I
> possess. Can't tell if it's a missing operation or an out-of-band
> one.

Faithful diagnosis: dreaming IS a five-operation workflow over existing
verbs (relink/merge/supersede/rebalance via update/synthesize via a
dream-kind store — documented in the souvenance SKILL.md), not a CLI
verb. But the hint text is the only thing a CLI-first agent sees at
that moment, and it reads like an operation name.

## Fix (small)

Update the dream_debt finding hint (src/db.ts, DREAM/VOL lines + the
session-end message) to point to the real surface, e.g.:

- instead of: `dream before sending a final message...`
- e.g.: `dream is a workflow over existing verbs, not a verb — see the
  souvenance SKILL.md "Dreaming" section (relink, merge, supersede,
  rebalance, synthesize)`

Tests that assert the hint strings need updating. No bump
(src/ is artifact scope — coordinate a bump or ride the next bump PR).
Speaker: works cold, self-instructing after the change.
