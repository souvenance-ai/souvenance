# Feature: FTS5 query sanitization fallback

## Problem

FTS5 raises a raw syntax error when a search query contains punctuation the
MATCH parser cannot handle: dotted numerics (`0.9`), hyphenated or colonated
identifiers (`better-sqlite3`, `node:sqlite`) and similar token glue. The CLI
surfaces a bare `fts5: syntax error near "."` — a cold agent that typed a
natural phrase gets an unhelpful failure instead of results.

Observed 2026-10-15 by the cold-retrieval evaluation: `memory search "0.9 rule"`
errors outright, and paraphrase queries that stall on token glue return nothing
when an enriched directive actually carries matching text.

## Decision

Sanitize at the library level (`src/db.ts`), not the CLI: `Store.search` retries
once with a punctuation-free version of the failed query — operators (OR/AND/NOT)
and quoted phrases preserved, punctuation inside bare tokens replaced by spaces.
Two FTS5 failure shapes trigger the fallback: a `fts5: syntax error` (dotted
numerics) and a `no such column: X` where X is the tail of a hyphenated/colonated
compound — trusted only when X appears in the query itself, so a genuinely bad
`--where` clause keeps surfacing as an error. The original error is rethrown
when the sanitizer cannot produce usable tokens. Ticket in `issues/`.
