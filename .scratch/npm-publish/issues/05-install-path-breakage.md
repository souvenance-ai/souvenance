# 05 — 0.1.0 install-path breakage: node cannot strip types under node_modules

Type: incident
Status: resolved

## What happened (2026-10-21)

Valentin published 0.1.0 manually and configured Trusted Publishing. The first
install-path smoke (`npx @souvenance/cli --help`, clean dir) FAILED:
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` — node refuses TypeScript
stripping for files under node_modules on every current node (no flag lifts
it; the check lives in the loader). The TS-source ship (decision c9fb7125) ran
fine from the repo checkout and passed every repo gate (285 tests, typecheck,
pack --dry-run) yet was dead at install — the repo-side gates could never see
the breakage because the checkout is not under node_modules.

## Resolution (0.1.1)

- Mechanism A (decision 38e8b225, revising c9fb7125): build ONLY at publish.
  `prepublishOnly` → `tsc -p tsconfig.build.json` (rootDir ., outDir dist,
  rewriteRelativeImportExtensions rewrites the emitted `../src/*.ts` imports
  to `../src/*.js`, layout preserved so `dist/bin` reaches `dist/src`) →
  `scripts/build-bin.mjs` copies the plain-JS bin into `dist/bin/`, rewriting
  its TS imports and failing loudly on any leftover `.ts` import.
- Tarball ships `dist/` only (+ README, LICENSE): no src/, no repo bin/.
  32 files again, zero TS/map leakage. Tests travel COMPILED inside dist
  (re-confirmation c6914b23 honored); caveat: bin.wiring tests spawn the repo
  bin, meaningful from a checkout, not from a consumer install.
- npm bin quirk (lived): bin values WITH the `./` prefix got `bin[memory]`
  dropped as invalid at publish dry-run; without `./` both aliases normalize
  cleanly and BOTH .bin symlinks materialize (`memory` + `souvenance`).
- engines stays >=24 (known-good floor; 22/23 untested by choice — decision).
- release.yml gains the install-path smoke AFTER publish (directive 5de23653):
  poll THIS TAG's manifest (18 × 10 s — the CDN lagged ~1 min on 0.1.0's first
  lookup) then `npx --yes @souvenance/cli@<tag-version> --help`. The release
  page drafts only after the smoke passes.
- Verified locally: typecheck clean, 285/285 green, `npm publish --dry-run`
  runs the prepublish build (registry-true path), real tarball installed into
  a fresh consumer dir — `souvenance --help`, `memory --help`, store+list
  cycle green (memory id 6cb090d4 round-tripped through node:sqlite).
- 0.1.0 stays on npm (same-version republish impossible); deprecation is
  Valentin's gesture. 0.1.1 ships via tag v0.1.1 — release.yml's inaugural run
  and the first Trusted Publisher proof.
