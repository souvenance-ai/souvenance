# 01 — add `--version` to the CLI (and the `version` subcommand)

Type: task
Status: resolved
Spec: see `../spec.md`

Valentin ordered it during phase-5 review: the CLI cannot currently report its own version — `souvenance --version` falls through to usage (exit 0, as observed cold on the published 0.1.1), so the bug template (`/.github/ISSUE_TEMPLATE/bug.yml`) asks `npm ls -g` instead, and an issue reported by a stranger carries no trustworthy version line.

Implement per the spec: `--version` flag + `version` subcommand, manifest read by walking up from `import.meta.dirname` (robust across src-run, dist-run, tarball-run), `unknown` over lying when the manifest is not found, interception before usage rendering, tests for the helper and the CLI contract.

Note: do NOT bump `package.json#version` in this ticket — the version bump belongs to the release moment (bump → tag → automated publish). Also update the bug template to prefer `souvenance --version` (keep `npm ls` as fallback for ≤0.1.1 installs).

## Comments

Implemented 2026-10-21, per spec.

### Implementation

- **Helper** `src/version.ts`: `resolveVersion(startDir)` walks up from the start dir until a `package.json` with a non-empty `version` string is found; a version-less manifest is not accepted (the walk continues past it); filesystem root reached → `"unknown"` — refuse to lie. Tests pass an explicit start path (unit-testable without touching argv).
- **Bin** (`bin/souvenance.js`): `--version` added to `BOOLEAN_FLAGS`; interception at the very top of `main()` — before the usage/help rendering AND before `Store.open`, so reporting the version never creates a DB side effect. Both forms intercepted: the `--version` flag and the `version` subcommand. One HELP line added to Flags (`--version        Print the version alone (also: souvenance version)`) — within the line budget.
- **Bug template** (`.github/ISSUE_TEMPLATE/bug.yml`): version question now leads with `souvenance --version`, keeps `npm ls -g @souvenance/cli` as the ≤0.1.1 fallback; the "does not yet print --version" aside removed. YAML parse-validated.

### Verification

- 6 new tests in `src/version.test.ts`: helper walks src/→repo manifest; dist-run layout (two levels up, fake version); version-less manifest skipped → keeps walking; no manifest → `unknown`; CLI `--version` triple (exit 0 / stdout `0.1.1\n` / stderr noise-only, no `.souvenance` side-effect dir); `version` subcommand equivalent.
- Full suite 291/291(+6), `tsc --noEmit` clean.
- Run-mode smokes on the real manifest: source run (`bin/souvenance.js`), dist run (`yarn build` → `dist/bin/souvenance.js --version` → 0.1.1, dist cleaned after; the npm tarball shares this layout and always carries package.json). HELP still renders on bare invocation; unknown command still exits 1.
- No version bump (stays 0.1.1 — bump belongs to the release moment).
