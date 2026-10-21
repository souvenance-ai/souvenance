# Contributing to souvenance

Thanks for the interest. souvenance is small and opinionated — this guide gets you productive fast.

## Setup

- **Node.js 24+** (the built-in `node:sqlite` module is the database engine), **yarn 4** (`corepack enable`).
- `yarn install`
- `yarn typecheck` — `tsc --noEmit`, must stay clean.
- `yarn test` — node's built-in test runner; tests are co-located as `src/*.test.ts` and run against temp stores.

## Layout

- `src/db.ts` — the deep module: the `Store` (open, WAL, migrate-on-open, busy-retry, all verbs). The CLI, HTTP server and MCP surface are thin over it.
- `src/server.ts`, `src/mcp.ts` — the HTTP and MCP surfaces. Both mirror the CLI verbs 1:1 and return the same JSON shapes.
- `bin/souvenance.js` — the CLI entry (the generic `memory` bin was dropped; `souvenance` is the only bin).
- `CONTEXT.md` — the domain glossary. Use these words: **memory** (one document), **content**, **metadata**, **relation** (a typed graph edge — not "link"), **kind**, **store** (the whole database, never one memory), **frontier** (the explore loop), **individual** (one store = one agent = one person).
- `docs/adr/` — architectural decisions (labeled property graph over a triple store; fork-never-sync). Structural changes add an ADR.
- `.scratch/` — the working issue tracker: one directory per effort, a `spec.md`, numbered issue files.

## Ground rules

- **Addition-only.** Memory content is immutable — corrections are `supersede`, `deprecate`, `merge`, never overwrites. Code that rewrites stored content silently is a design bug.
- **No schema migrations by hand.** The store migrates on open; new migrations are additive and tested.
- **Minimal dependencies** — currently `hono` for the HTTP surface, nothing else at runtime.
- **Linear history** — PRs land by rebase merge, no merge commits.
- **Repo gates are necessary, never sufficient.** Tests and typecheck do not prove an install works: release claims come only after the install-path smoke in `release.yml`.

## Pull requests

main is PR-only — direct pushes are refused by branch protection; history stays linear (rebase merges, no merge commits).

- **Every change lands from a branch through a pull request.** One concern per PR; keep arcs small.
- **The release rides the PR.** A PR touching the artifact scope (`src/`, `bin/`, `package.json`, `README.md`, `LICENSE`, `scripts/build-bin.mjs`, `tsconfig.build.json`) must carry its own `package.json` bump — the `release-check` gate fails otherwise. Merging such a PR IS the release: the tag is pushed automatically and the publish flow (gate, OIDC trusted publishing, install-path smoke, release page) runs. Bump level is patch by default — adjust the version in the PR when the change deserves more.
- **PRs outside the artifact scope** merge without a bump — `.scratch` tickets, docs and skills never publish.
- `scripts/release-status.mjs` reports the release state at any moment (last tag, staged bump, pending artifact-scope commits, suggested version).

## Bugs and features

Open a GitHub issue — the [bug report form](https://github.com/souvenance-ai/souvenance/issues/new?template=bug.yml) asks for the surface, version and repro commands; run `souvenance doctor` first and paste its findings if any. Feature ideas are welcome as blank issues: describe the use case, not just the mechanism — increments here are demand-driven, so the lived need is the argument.
