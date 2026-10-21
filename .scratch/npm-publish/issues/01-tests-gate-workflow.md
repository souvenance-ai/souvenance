# 01 — tests gate workflow (every push / PR)

Type: task
Status: resolved

## Resolution (2026-10-21, commit npm-publish arc)

`.github/workflows/tests.yml` created exactly as shaped. YAML formally parsed (PyYAML). Local validation done: typecheck silent-pass, suite 285/285 (6.5 s) — but note honestly: no CI existed in this repo before, so the workflow has NEVER executed on a runner yet; the first live verification is the repo's next push/PR on GitHub (expected: Valentin's push of this work). The `corepack enable` step carries COREPACK_ENABLE_DOWNLOAD_PROMPT=0 to avoid the first-use prompt in non-interactive CI.

## Problem

Q26 requires a standing CI gate on every push and every PR: typecheck + the full suite. It is both the merge-confidence signal and the model the release workflow re-runs before publishing. The repo has no `.github/` at all today — this workflow is the first CI the product ever had.

## Shape

- `.github/workflows/tests.yml`, `on: [push, pull_request]`.
- Steps: checkout → setup-node 24 → corepack enable → `yarn install --immutable` → `yarn typecheck` → `yarn test`.
- `permissions: contents: read` (read-only job), concurrency group per ref with cancel-in-progress to cut superseded runs.
- No dependency cache knob (deps are tiny: @types/node + typescript; a misconfigured yarn4 cache buys nothing and costs a config).

## Comments

- 2026-10-21, first live run (run 39591322880, push 2bd8c6f): the workflow itself held end to end — corepack, immutable install, typecheck, all steps green in seconds — and the gate caught a fragility that 285 local greens had missed: server.test.ts asserted strict `[s2, s1]` order on `/recover` while the two summaries were stored inside the same millisecond, so the created_at DESC tie order was undefined on a fast runner. Fix is test-side (commit dff8684): a clock-tick helper between the back-to-back stores, two spots (directives + summaries); no API semantics change — "latest first" is defined across distinct timestamps, ties are an artifact of ms precision. The gate proving its value on its first live run is the lesson: local-green is a floor, not a ceiling.
