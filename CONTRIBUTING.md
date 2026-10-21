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
- `bin/souvenance.js` — the CLI entry (the `memory` bin is a transition alias to the same file).
- `CONTEXT.md` — the domain glossary. Use these words: **memory** (one document), **content**, **metadata**, **relation** (a typed graph edge — not "link"), **kind**, **store** (the whole database, never one memory), **frontier** (the explore loop), **individual** (one store = one agent = one person).
- `docs/adr/` — architectural decisions (labeled property graph over a triple store; fork-never-sync). Structural changes add an ADR.
- `.scratch/` — the working issue tracker: one directory per effort, a `spec.md`, numbered issue files.

## Ground rules

- **Addition-only.** Memory content is immutable — corrections are `supersede`, `deprecate`, `merge`, never overwrites. Code that rewrites stored content silently is a design bug.
- **No schema migrations by hand.** The store migrates on open; new migrations are additive and tested.
- **Minimal dependencies** — currently `hono` for the HTTP surface, nothing else at runtime.
- **Linear history** — ff-only merges, no merge commits.
- **Repo gates are necessary, never sufficient.** Tests and typecheck do not prove an install works: release claims come only after the install-path smoke in `release.yml`.

## Bugs and features

Open a GitHub issue — the [bug report form](https://github.com/souvenance-ai/souvenance/issues/new?template=bug.yml) asks for the surface, version and repro commands; run `souvenance doctor` first and paste its findings if any. Feature ideas are welcome as blank issues: describe the use case, not just the mechanism — increments here are demand-driven, so the lived need is the argument.
