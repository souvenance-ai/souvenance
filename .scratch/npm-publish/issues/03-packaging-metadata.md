# 03 — packaging metadata (package.json + LICENSE)

Type: task
Status: resolved

## Resolution (2026-10-21, commit npm-publish arc)

package.json gained `license: "MIT"` and the `files` whitelist `["bin/", "src/", "README.md", "LICENSE"]`; `engines.node` is now `>=24` (decision c9fb7125, honest flagless floor). LICENSE added, copyright `Valentin Richard` per Valentin's answer at decision time. Validation: `npm pack --dry-run` lists EXACTLY the whitelist — 32 files, 90.9 kB tarball, 386.0 kB unpacked, no .agents/docs/.scratch/yarn leakage. Smoke: bin runs from the tree (help ok).

## Problem

The first publish is imminent and package.json is missing identity fields npm needs; the files include is currently "everything not gitignored" (docs, .agents, .scratch prose would ship).

## Shape (decided, memory c9fb7125)

- `license: MIT` + LICENSE file, copyright `Copyright (c) 2026 Valentin Richard`; identity MIT comes from the product-identity decisions (memory 8ac4a5b2), the copyright line Valentin gave at decision time (2026-10-21).
- `engines.node`: `>=24` — the honest floor for a TS-source package (node:sqlite + strip-types run flagless); >=22 rejected as untruthful (node 22 breaks without flags).
- `files`: `["bin/", "src/", "README.md", "LICENSE"]` — bin imports `../src` so both travel; co-located test files ship with src (harmless, run only under `--test`); yarn.lock and .yarnrc.yml stay unshipped.
- Validation: `npm pack --dry-run` must list exactly the whitelist and nothing else.
