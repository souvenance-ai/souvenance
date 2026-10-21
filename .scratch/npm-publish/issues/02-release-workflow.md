# 02 — release workflow (tag-driven, trusted publishing)

Type: task
Status: resolved (live-verified: v0.1.2 tagged on merge and published, dispatch run 39613623714 green)

## Resolution (2026-10-21, commit npm-publish arc)

`.github/workflows/release.yml` created exactly as shaped: gate steps, tag guard with remediation text, `npm install -g npm@latest` before publish, `npm publish --access public --provenance`, then `gh release create --generate-notes`. YAML formally parsed (PyYAML). Untested on a runner by design — its first possible live run is a tag after the manual first publish (the workflow also runs the identical tests gate, so a tag push exercises the whole path; the duplicate gate run per tag is accepted, correctness over duplicate-run cleverness).

## Problem

Q26: pushing tag `vK.L.M` runs the gate then publishes @souvenance/cli; credentials via TRUSTED PUBLISHING (OIDC) — no long-lived NPM_TOKEN secret; the FIRST publish (0.1.0) stays manual, so this workflow exists to make every release after it automatic.

## Shape

- `.github/workflows/release.yml`, `on: push.tags=v*.*.*`.
- `permissions: contents: write` (GitHub release page for the tag) + `id-token: write` (the OIDC claim npm exchanges for a short-lived publish grant).
- Steps: checkout → setup-node 24 with registry-url → corepack → `yarn install --immutable` → typecheck → test → tag guard → `npm install -g npm@latest` → `npm publish --access public --provenance` → `gh release create --generate-notes`.
- Tag guard: `v<ref>` must equal `package.json#version` or the run fails loudly with remediation text — the version lives in the committed package.json; bump-then-tag is the release gesture.
- npm upgraded to latest before publish: trusted publishing needs npm >= 11.5.1 and the runner's bundled npm drifts; explicit upgrade instead of hoping.
- `--provenance`: the automated releases get provenance stamps; the manual first publish does not (accepted trade of the manual-first decision).
- Known non-issue: the tag push also matches tests.yml push trigger, so the gate runs twice per tag (once read-only, once pre-publish); suite is seconds, correctness beats duplicate-run cleverness.
