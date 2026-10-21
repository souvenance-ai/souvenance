# 03 — regime switch: PR-only main, bump-in-PR, release on merge

Type: task
Status: ready-for-agent
Spec: see `../spec.md` + the addendum below (decision d47ce3ec pending store)

Valentin revised the model the day after leg 2 was built: instead of a separately generated release PR,
the governance becomes strict — main is PR-only (branch protection), every change lands from a branch
through a PR, **a package-impacting PR carries its own `package.json` bump**, and the merge of any bump
PR is the release. The tag-on-bump leg (ticket 01) is the engine that survives verbatim; the release PR
generator (ticket 02) is superseded in-flight by the merge-discipline itself.

### Decisions resolved with Valentin (2026-10-21, all four options confirmed)

- Bump scope: **artifact scope only** (the detector's scope) — a `.scratch`/docs/skills PR merges
  without bumping; npm versions are not burned on invisible churn.
- Merge rights: **the agent merges no-bump PRs himself** (zero blocking); a bump PR waits for
  Valentin's approve+merge — the release veto.
- Protection: **posed via `gh api`** (lifaon74 admin, `repo` scope confirmed) — ruleset "main is
  PR-only": PR required, deletion + non-fast-forward refused, no bypass; required checks added after
  the genesis PR shows the real check contexts.
- Landing: **rebase merge only** (linear, no merge commits — matches the ff-only practice), squash
  off, `delete_branch_on_merge` on.

### Implementation

- `scripts/release-scope.mjs` — the shared artifact scope (extracted from release-status.mjs; drift
  between the two readers becomes impossible).
- `scripts/pr-check.mjs` — PR-mode check (BASE_SHA/HEAD_SHA from git): artifact-scoped PR without a
  version change between base and head → exit 1 (loud omission); scoped WITH a bump → pass naming the
  version the merge publishes; unscoped → pass "no release owed".
- `.github/workflows/release-check.yml` — `pull_request` gate running the check; replaces
  `release-pr.yml` (deleted).
- `CONTRIBUTING.md` — the public PR flow documented; stale `memory`-alias sentence fixed; linear-history
  line now names rebase merges.
- The genesis PR carries: the two local commits (d9eaf95 --version, 72ebad7 the original automation) +
  these regime changes + the bump to 0.1.2. Valentin's merge of it = first release of the regime.

### Verification

- `pr-check.mjs` traced locally: base/head both 0.1.1 + scoped → fail path (exit 1); bump to 0.1.2 →
  pass; unscoped diff → pass.
- Workflows parse-validate; `release-status.mjs` output unchanged in shape after the scope extraction.
- Genesis proof: the PR self-describes (release-check must pass on it because IT carries the bump).

## Comments

Regime live and PROVEN 2026-10-21. Genesis PR #1 merged by Valentin (13:40, merge commit cae5259 — the
transition one-off: rebase-only wasn't yet enforced at merge time). First merge→release cycle completed
end-to-end AFTER two lived catches, both paid through the new discipline:
1. **The lockfile class recurred** (the regime's first catch, PRE-merge this time): the PR checks failed
   — yarn.lock still pinned `memory: dist/bin/souvenance.js` after the bin-drop commit; origin/main had
   been red unnoticed since that push. Fix 060aa97: surgical one-line regen, `--immutable` verified
   locally before push (the phase-4 lesson honored).
2. **The trusted-publisher mismatch** (post-merge): release-tag tagged v0.1.2 then npm E404 — the OIDC
   claim (decoded from the sigstore transparency log, rekor 3356882188) names
   `release-publish.yml@refs/heads/main` while the npm config declared `release.yml`; the
   callable-refactor changed the claim's file. Valentin redeclared the workflow in npm's UI.
3. **The dispatch path had no permissions**: re-dispatch failed EUSAGE (id-token write) — the callable
   now carries its own top-level permissions (PR #2, merged by the agent himself — first no-bump
   autonomous merge, rebase, branch auto-deleted).

Final state: `gh workflow run release-publish.yml -f tag=v0.1.2` GREEN (2m15); independent verification —
npm view latest = 0.1.2, stranger-path npx store round-trip, **`--version` answered `0.1.2` from the
registry** (first self-reporting release, ticket 01 live in production), release page v0.1.2 published.
Ruleset 25550961 active: PR-only, no bypass, deletion/non-ff refused, rebase-only merge methods,
required checks test+check.
