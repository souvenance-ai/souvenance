# Spec: CLI version flag

Valentin's order (2026-10-21): "ajoute toi une tâche pour rajouter `--version` à la CLI". Motivation chain: the bug template cannot ask users for `souvenance --version` (it does not exist — the flag currently falls through to usage, exit 0), so it asks `npm ls -g` instead; release install-path smokes and issue reports both want a self-reporting binary.

## Requirements

1. `souvenance --version` prints the version and exits 0. Also accept the equivalent `souvenance version` subcommand form.
2. Unknown output contract stays consistent with the CLI's: the version alone on stdout (`0.1.1`), no decorations.
3. The version is read from the package manifest, dual-source (single source of truth): locate `package.json` by walking up from `import.meta.dirname` — robust under all run modes: TS source run (`src/cli.ts` → one level up), built dist (`dist/bin/souvenance.js` → two levels up), npm tarball (`dist/bin/souvenance.js` → two levels up; package.json is always included in tarballs regardless of the files whitelist). If the manifest is not found, print `unknown` — refuse to lie.
4. Flag interception happens before usage rendering (`--version` currently prints usage; today's fallback must be replaced).
5. Tests: unit-test the version-resolution helper (manifest found vs not-found) by passing an explicit start path; CLI-level assertion that `--version` returns the expected triple shape against the real manifest of the repo.

## Non-goals

- No telemetry, no update check, no changelog embedding — the version and nothing else.
- `--help` output may mention it, but keep HELP additions to one line (bin/memory.js HELP notes have a line budget, see supersede-kind-inheritance precedent).
