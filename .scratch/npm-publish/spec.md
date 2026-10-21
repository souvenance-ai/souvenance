# Spec: phase 4 — npm publish of @souvenance/cli

Goal: ship @souvenance/cli@0.1.0 to npm (FIRST publish manual by Valentin) and land the durable automated release path behind him.

## Held decisions

- Q26 (memory 21fd24c8): publish TAG-DRIVEN — pushing tag `vK.L.M` runs typecheck + tests then publishes; not every-merge. Credentials via TRUSTED PUBLISHING (OIDC, no long-lived NPM_TOKEN; one-time config by Valentin in the npm org; fallback to a secret token only on lived friction). A separate tests workflow runs on every push/PR as the standing gate. FIRST PUBLISH stays MANUAL (Valentin's sole exception to automation).
- Packaging (memory c9fb7125): package ships TypeScript SOURCE (bin imports `../src/*.ts`), so `engines` is an honest `>=24` (flagless floor for node:sqlite + strip-types; LTS = nearest practical floor). A tsc dist build and documented NODE_OPTIONS flags were rejected. `files` whitelist: bin/, src/ (co-located tests travel — harmless, run only under --test), README.md, LICENSE. MIT identity encoded: `license: MIT` + LICENSE file, copyright `Valentin Richard`. release.yml carries a TAG GUARD: tag must equal package.json#version, loud failure otherwise.
- Minor addendum to Q26 (cheap, reversible): each pushed tag also drafts a GitHub Release page with generated notes.

## Tickets

- `issues/01-tests-gate-workflow.md` — the standing gate on every push/PR.
- `issues/02-release-workflow.md` — tag-driven publish via OIDC trusted publishing.
- `issues/03-packaging-metadata.md` — package.json fields + LICENSE.
- `issues/04-first-publish-runbook.md` — Valentin's hands: npm org Trusted Publishing config, manual publish, post-publish smoke.

## Valentin-side acts after a green merge

1. Configure Trusted Publishing in the npm org for @souvenance/cli → repo souvenance-ai/souvenance, workflow `release.yml` (ticket 04).
2. Manual first publish (ticket 04 runbook).
3. Post-publish smoke: `npx @souvenance/cli --help` in a scratch dir — the MVP jalon check that phase 5 reuses.

## Gate

Same as the house floor: full suite green, typecheck clean, bin smoke (help ×2, doctor healthy), plus `npm pack --dry-run` listing exactly the whitelisted files.
