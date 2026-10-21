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
