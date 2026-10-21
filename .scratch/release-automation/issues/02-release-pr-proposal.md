# 02 — release PR proposal: the detector opens the release moment

Type: task
Status: resolved (superseded by ticket 03 in-flight — the generator gave way to the PR-only regime; the
detector and scope survive as shared infra)
Spec: see `../spec.md` (leg 2)
Blocked by: 01 (a release PR is only worth proposing once a bump publishes automatically)

A version bump publishes automatically after ticket 01, but nothing notices that a release is DUE.
Implement per the spec:

1. `scripts/release-status.mjs` — the shared detector (humans, agent, workflow): prints JSON
   `{ last_tag, version, staged (version ≠ last tag), pending_commits (package-impacting commits since
   last tag), commits (subject list), suggested_version (one patch bump of the CURRENT version) }`
   - Artifact scope exactly per spec: `src/`, `bin/`, `scripts/build-bin.mjs`, `tsconfig.build.json`,
     `package.json`, `README.md`, `LICENSE` — `.github/`, `.scratch/`, `docs/`, `.agents/`, yarn.lock
     excluded. Non-version tags (`pre-genesis`) filtered by matching `v*`.
   - Exit code stays 0 in every state — this is a status report, not an alarm.
2. `.github/workflows/release-pr.yml` — `on: push: branches: main` (`fetch-depth: 0`): run the detector;
   - debt (pending commits AND NOT staged) and no open release PR → bump `package.json` to the suggested
     version on branch `release/current`, one commit `release: v<version>` (the commit content is the
     whole proposal — Valentin can adjust the version inside the PR before approving), push the branch,
     open PR `release: <version>` with: the commit list since the last tag, the scope that triggered, and
     the contract line ("merge = approve the publish; tag + publish + install-smoke run automatically;
     adjust the version in this PR if it warrants more than a patch").
   - a release PR already open: if it was generated from the current HEAD → leave it; if stale (newer
     package-impacting commits) → close it with the stare-comment and regenerate.
   - NOT debt (nothing pending, or release staged) → close any open release PR ("nothing pending" /
     "release staged, publish underway").
   - Permissions `contents: write` + `pull-requests: write`. Branch pushes from Actions do not trigger
     other workflows (the same GITHUB_TOKEN rule) — no self-recursion; the loop closes only on Valentin's
     merge, by design.
3. The merge path (release PR merged → main → leg 1 tags and publishes) already exists after ticket 01 —
   do not touch it here.

Verification: YAML parse-validated; the detector demoed live — at implementation time the repo must report
pending=2 (83d1e22, d9eaf95), staged=false, suggested 0.1.2. Genesis proof as in the spec: the push that
delivers the pair of workflows should see the 0.1.2 release PR open itself.

## Comments

Implemented 2026-10-21.

### Implementation

- `scripts/release-status.mjs`: artifact scope exactly per spec (src/, bin/, scripts/build-bin.mjs,
  tsconfig.build.json, package.json, README.md, LICENSE); `git diff-tree`-per-commit scope filter;
  `v*`-filtered sort for the last tag (pre-genesis excluded); no-v-tag fallback uses an empty-tree range;
  exit 0 in every state — status, never alarm. Output: `{last_tag, version, staged, pending_commits,
  commits, suggested_version}` (patch bump of the CURRENT version — the PR is the adjustment surface).
- `.github/workflows/release-pr.yml`: `push: branches: [main]` → detector → two mutually-exclusive
  branches: close-obsolete (staged or nothing pending: closes any standing release PR with the reason)
  / generate (debt: `git checkout -B release/current`, CRLF-preserving patch bump + `release: v<version>`
  commit, force-push, then `gh pr edit` in place when a PR already exists — review thread kept — or
  `gh pr create`; the body lists the commits, the contract line, and the adjust-in-PR invitation).
  Idempotence: a PR whose bump commit sits directly on `GITHUB_SHA` is left alone (docs-only pushes
  re-run the job without churn).
- The merge path (Valentin merges → main → release-tag.yml tags and publishes) was built in ticket 01 —
  untouched here.

### Verification

- Detector live demo: pending_commits = **4** — d9eaf95 (bin/src), 38aaba9 (README), 83d1e22
  (package.json), 3d027a6 (README) — staged=false, suggested 0.1.2. The spec's "expect 2" undercounted:
  the README rewrites (outsider docs 3d027a6, consumer-first 38aaba9) correctly count — they ship in the
  tarball. Spec prediction corrected here; the scope behaves MORE honestly than forecast.
- Bump dry-run on the real package.json: exactly 1 line changed (version only), CRLF line endings
  preserved (the file is CRLF — a plain JSON.stringify would have diffed every line), then restored.
- 4/4 workflow files parse-validate. Genesis proof (the 0.1.2 release PR opening itself) expected on the
  push that delivers the pair of workflows — observed by Valentin on GitHub.
