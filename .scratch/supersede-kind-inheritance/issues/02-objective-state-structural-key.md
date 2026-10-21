# 02-objective-state-structural-key

Type: task
Status: needs-triage
Extends: 01-inherit-structural-keys (resolved)

## Question

The recovery ritual's step 3 (`list --where "metadata->>'$.kind' = 'objective' AND metadata->>'$.state' = 'open'"`) silently missed the product objective `683dd7bc` — the store's most important standing commitment — from its registration at 2026-10-21T12:21:45 until today. Root cause: the objective's metadata was `{"kind":"objective","tags":["repackage","souvenance","identity"]}` — **no `state` field**. "State: open" lived only in the content prose.

Mechanism: the successor was constructed by `supersede` with an explicit `--metadata` override that included `kind` and `tags` but omitted `state`. Per the resolution of ticket 01, explicit metadata is used **verbatim, no blending** — so `state` was dropped by design. The 01 fix closed the *inherit* path (no `--metadata` → inherits kind/tags) but `state` is not a structural key anywhere: `structuralInherit` never copies it, and the explicit-override path has no reason to. Meanwhile the doctor has no check for `kind: "objective"` without a `state` field — it reported healthy with the gap present.

Failure surface is the same class as 01: a structural metadata key lost in successor construction makes a memory invisible to a read ritual — but this one needed *both* the override path and the missing doctor check to go unnoticed.

How should successor construction and the doctor stop producing (and stop tolerating) state-less objectives?

## Candidates (not decided)

- **Doctor check**: a finding for `kind: "objective"` whose metadata lacks `state` (or whose `state` is not one of `open|parked|done`). Catches every path — explicit override, inherit, hand-authored — at ritual time. Cheapest, most general.
- **Kind-scoped structural keys**: extend `structuralInherit` so that for objective sources, `state` carries like `kind` does when explicit metadata omits it. Tension: weakens the "explicit wins, verbatim" resolution of 01 — an explicit override that omits a key currently means "drop it"; making `state` special re-introduces blending for one key.
- **Skill guidance**: supersede-of-objective recipes should echo `state` in `--metadata`. Guidance alone was already rejected in 01 ("the defect showed the failure mode is silent drift, which guidance alone does not prevent").

## Data repair (done at discovery, 2026-10-21)

`memory update 683dd7bc --metadata '{"kind":"objective","state":"open","tags":["repackage","souvenance","identity"]}'` — recovery query re-run, both open objectives (`683dd7bc`, `d35f1bda`) now visible.

## Comments
