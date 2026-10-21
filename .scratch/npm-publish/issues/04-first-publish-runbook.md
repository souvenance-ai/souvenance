# 04 — first publish runbook (manual — Valentin)

Type: task
Status: resolved (first publish done 2026-10-21; 0.1.0 deprecated, 0.1.2 live from the registry)

The first publish is YOUR hands (Q26: the sole exception to automation). Every release after it is tag-driven through `release.yml` — nothing for you then but a version bump and a tag.

## 0. If the org does not exist yet

npmjs.com → "Add Organization" → name `souvenance` → free plan (public packages are gratis).

## 1. One-time: configure Trusted Publishing (configures the AUTOMATED path; order relative to the manual publish does not matter)

1. npmjs.com → sign in as the @souvenance owner.
2. Org → Packages → @souvenance/cli → Settings → "Publishing access" → "Trusted Publisher" (wording may drift).
3. Connect: **repository owner** `souvenance-ai`, **repository name** `souvenance`, **workflow filename** `release.yml`, **environment** empty (release.yml declares none).
4. Save. No secret travels — npm exchanges GitHub OIDC claims at publish time. Fallback on lived friction: an automation-token secret in the repo (documented in the objective as the escape hatch, decision 21fd24c8).

## 2. The first publish

```sh
npm login                 # once on this machine (web flow, 2FA)
git checkout main && git pull   # after the release-automation work is merged
npm publish --access public     # OTP prompt if 2FA is on publish
```

No `--provenance` on the manual one: provenance requires OIDC from CI — the accepted trade of the manual-first decision.

## 3. Post-publish smoke (the MVP jalon check; phase 5 reuses this)

```sh
npm view @souvenance/cli
cd "$(mktemp -d)"
npx @souvenance/cli --help            # the one-line install works for a stranger
npx @souvenance/cli store "hello from npm" --metadata '{"kind":"note"}'
npx @souvenance/cli doctor
```

Npx fetches, stores land in the scratch dir's own `.souvenance/` — nothing touches real stores.

## 4. Every release after this one (agent's hands, modulo the git directive)

Bump `package.json#version` on main → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → `release.yml` gates, guards tag==version, publishes via OIDC, drafts the GitHub release page.
