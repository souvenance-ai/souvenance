# 01 — add `--version` to the CLI (and the `version` subcommand)

Type: task
Status: ready-for-agent
Spec: see `../spec.md`

Valentin ordered it during phase-5 review: the CLI cannot currently report its own version — `souvenance --version` falls through to usage (exit 0, as observed cold on the published 0.1.1), so the bug template (`/.github/ISSUE_TEMPLATE/bug.yml`) asks `npm ls -g` instead, and an issue reported by a stranger carries no trustworthy version line.

Implement per the spec: `--version` flag + `version` subcommand, manifest read by walking up from `import.meta.dirname` (robust across src-run, dist-run, tarball-run), `unknown` over lying when the manifest is not found, interception before usage rendering, tests for the helper and the CLI contract.

Note: do NOT bump `package.json#version` in this ticket — the version bump belongs to the release moment (bump → tag → automated publish). Also update the bug template to prefer `souvenance --version` (keep `npm ls` as fallback for ≤0.1.1 installs).
