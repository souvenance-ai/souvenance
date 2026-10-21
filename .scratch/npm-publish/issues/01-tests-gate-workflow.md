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
