# 01 — Sanitize FTS5 queries as a fallback in Store.search

Status: resolved

## Spec

`src/db.ts`: on a `/fts5: syntax error/` failure of the raw MATCH query, retry
once with `sanitizeFtsQuery(query)` — a module-level exported helper that keeps
operators (`OR`/`AND`/`NOT`) and quoted phrases, strips punctuation from bare
tokens (dotted numerics `0.9`, hyphenated `better-sqlite3`, colonated
`node:sqlite`), and returns `null` when nothing usable remains so the original
error surfaces. Valid queries must never hit the fallback.

## Answer

Implemented 2026-10-15. `Store.search` wraps the MATCH execution and retries
once on malformed FTS5 queries; the trigger covers both failure shapes found by
testing — `fts5: syntax error` (dotted numerics) and `no such column: <tail>`
(hyphenated/colonated compounds parsed as column filters, e.g.
`better-sqlite3` → `no such column: sqlite3`) — scoped to tails that actually
appear in the query so a bad `--where` still errors. `sanitizeFtsQuery` and
`ftsErrorFromQuery` added with unit and behavior tests in `src/db.test.ts`.
Verified on the live store: `search "0.9 vs 0.5"` now returns the weight-semantics
directive, bare `better-sqlite3` returns a clean `[]` (no such token in the
store) instead of crashing, and valid queries plus `OR` operators behave
exactly as before. 152 tests, typecheck clean.
