# 01 — tag-on-bump: a version bump on main publishes automatically

Type: task
Status: resolved
Spec: see `../spec.md` (leg 1)

The publish flow (gate → tag guard → OIDC → install-path smoke → release page) currently runs only when a
human pushes a tag. Nothing connects "a version bump landed on main" to "publish now" — and a workflow
cannot just push the tag and hope: actions running under the default GITHUB_TOKEN never trigger other
workflows (GitHub's anti-recursion rule), so today's tag-triggered release.yml would stay silent.

Implement per the spec:

1. Extract the publish body into `.github/workflows/release-publish.yml` — `on: [workflow_call,
   workflow_dispatch]` with a `tag` input; parameterize the two tag-dependent steps (the install smoke's
   version polling and the release page name) instead of reading `GITHUB_REF_NAME` directly. The steps'
   behavior must remain the ones that ran green on 0.1.1 — refactor is callability only, not behavior.
2. `release.yml` becomes thin: still triggers on `push: tags: v*.*.*`, single job `uses:
   ./.github/workflows/release-publish.yml` with `tag: ${{ github.ref_name }}`.
3. New `.github/workflows/release-tag.yml`: `on: push: branches: main` — read HEAD's
   `package.json#version` and the last `v*` tag; if they differ AND `v<version>` does not exist locally AND
   `npm view @souvenance/cli@<version>` reports the registry does NOT have it, push `v<version>` and invoke
   the callable publish workflow with that tag. Otherwise exit 0 silently (already tagged / registry
   already has it / no bump staged). `git describe` must be tag-filtered (`--match 'v*'`) — the repo
   carries a non-version tag (`pre-genesis`), and `fetch-depth: 0` is required for history.
4. Permissions: `contents: write` (tag push); the OIDC/config environment of the publish steps is carried
   by the callable workflow itself.

Verification: YAML parse-validated; a dry trace of the decision rule against the live repo (last tag
v0.1.1, HEAD version 0.1.1 → "no bump staged, exit 0") and against a simulated bump (version 0.1.2 →
"would tag and publish"). The end-to-end first run is expected on the push that delivers this workflow
together with the pending commits — that is the designed genesis proof, observed by Valentin on GitHub.

## Comments

Implemented 2026-10-21.

### Implementation

- `.github/workflows/release-publish.yml`: the 0.1.1-green publish body extracted byte-for-byte into a
  callable workflow (`workflow_call` + `workflow_dispatch`); `TAG` input replaces `GITHUB_REF_NAME` in
  the guard, the install smoke and the release page; checkout pinned to the tagged tree
  (`ref: inputs.tag || github.ref_name`). Behavior unchanged — callability only.
- `.github/workflows/release.yml`: now the thin tag-push trigger, single `uses:` job.
- `.github/workflows/release-tag.yml`: `push: branches: [main]` → decide step (HEAD version vs last
  `v*` tag `--sort=-v:refname`; local tag existence; registry pre-check `npm view` — a version npm
  already carries is skipped, republishing would only fail) → tag push → `needs:` publish job calling
  the callable with the fresh tag.

### Verification

- 4/4 workflow files parse-validate (python yaml).
- Live trace: HEAD 0.1.1 == last tag v0.1.1 → "no bump staged, exit 0" (the current quiet state).
- Registry-absent trace: `npm view @souvenance/cli@9.9.99` fails as expected — the gate a would-tag
  version must pass.
- The `node -p "require(package.json)"` pattern comes from the 0.1.1-green guard (Node 24 require(esm)).
- Genesis proof deferred to the next push (workflows must exist on origin main to run) — Valentin
  observes the tag-on-bump leg on the next real bump.
