# Spec: automated release loop — change → bump → tag → publish

> **Addendum (2026-10-21, ticket 03 — Valentin's revision, same day).** The regime is stricter than the
> original option A: main is PR-only (branch protection), changes land only via branch+PR, a
> package-impacting PR carries its own bump, and the merge of a bump PR releases. The release PR
> generator (leg 2 below, ticket 02) is superseded by `release-check.yml` — a PR gate that makes a
> forgotten bump a red check instead of a silent skip; leg 1 (tag-on-bump) survives unchanged and is
> the engine of "merge → release". Bump scope: artifact scope only. Agent merges no-bump PRs himself;
> bump PRs merge only by Valentin's approve. Landing: rebase merge only.

Valentin's finding (2026-10-21): the tag→publish leg is automated (release.yml — gate, tag==package.json
guard, OIDC trusted publishing, install-path smoke, release page), but the change→bump→tag leg is an
unscheduled human gesture: nothing detects that package-impacting commits accumulated since the last tag,
and nothing triggers the release moment. Live proof at filing time: `v0.1.1..HEAD` held two
package-impacting commits (83d1e22 bin-alias removal — explicitly "effective NEXT release" — and d9eaf95
--version) waiting on nobody.

Valentin chose option A (full loop): detection + release PR. The veto stays with him (approving the
release PR = approving the publish); the "when" stops being a judgment call — the exact silent-judgment
class this repo converts into mechanical checks everywhere else (finish for the dream debt, the guard for
the tag, directive 5de23653 for publish claims).

## Leg 1 — tag-on-bump (ticket 01)

Any push to main where `package.json#version` **changed relative to the last `v*` tag**, the `v<version>`
tag does not already exist, and the registry does not already carry that version → the tag is pushed
automatically and the publish flow runs (gate → guard → OIDC publish → install-path smoke → release page).

Mech mistake to avoid: a workflow action cannot trigger another workflow when the triggering token is the
default `GITHUB_TOKEN` (GitHub's anti-recursion rule) — so pushing the tag from a workflow would never run
today's release.yml. The publish body must move to a **callable workflow** (`workflow_call`) that both the
existing tag-push trigger and the new main-push trigger invoke via `uses:`.

Registry pre-check: before tagging, `npm view @souvenance/cli@<ver>` — if the registry already has the
version (manual past publishes like 0.1.0, re-tags after a failed smoke), skip with a notice; `npm publish`
cannot republish a version and would only paint the run red.

## Leg 2 — the release PR proposal (ticket 02)

On every push to main, a detector (`scripts/release-status.mjs`, shared with humans and the agent) answers:
are there **package-impacting commits since the last tag**, and is a release **staged** (version ≠ last tag)?

- **Artifact scope** (what counts as package-impacting): the publish whitelist shape — `src/` (tests ship
  deliberately, decision c9fb7125 + re-confirmation), `bin/`, `scripts/build-bin.mjs` (build step — it
  shapes the tarball), `tsconfig.build.json` (compile shape), `package.json` (deps/engines/bin/files/…),
  `README.md`, `LICENSE`. Excluded: `.github/` (publish plumbing, not artifact), `.scratch/`, `docs/`,
  `.agents/`, yarn.lock (not packed).
- **Debt** (pending commits, version NOT staged) → open a **release PR** from a fixed branch
  (`release/current`): bumps `package.json` by one **patch** (suggested default — the PR body invites
  adjusting the version inside the PR if the changes warrant more; the level is never auto-guessed from
  commit text), lists every included commit, and states the contract: merge = approve the publish; the
  tag + publish + install-smoke then run automatically (leg 1).
- **Staleness**: new package-impacting commits while a release PR is open → close it ("stale: newer
  commits, regenerated") and re-create from the new HEAD. No debt, or release already staged → close any
  open release PR. One release PR at a time, always current.
- **Merge semantics**: the release PR merged by Valentin is a push to main → leg 1 sees the version change
  → tag → publish. The loop closes.

## Non-goals

- No changelog file, no changesets/release-please tooling (this repo's commit style is `area: subject`,
  not conventional prefixes — a conventional parser would map every commit to "chore" and stay mute).
- No auto-merge of the release PR, ever — the approval is the veto.
- No version level auto-computed from commit messages.
- No CI failure on unreleased debt — unreleased-by-design stretches are legitimate; visibility, not alarm
  (the detector output is a status, and the release PR is the reminder).

## Verify

- The loop proves itself on its own first run: the first push carrying these workflows lands together
  with pending package-impacting commits → the 0.1.2 release PR should materialize from that very push
  (workflows must exist on origin main to run at all — first push = genesis run).
- Detector correctness is demoed against the live repo state at implementation time. Observed (2026-10-21):
  pending = **4** commits (83d1e22 package.json, 3d027a6 README, 38aaba9 README, d9eaf95 bin/src) — the
  earlier "expect 2" forecast missed that README rewrites ship in the tarball; the honest scope counts
  them. staged=false, suggested 0.1.2.
- Workflow YAML validated (parse); the publish steps must remain byte-for-byte the ones that ran green on
  0.1.1 (decision 21fd24c8, incident chain ticket 05) — refactor is callability only, not behavior.
