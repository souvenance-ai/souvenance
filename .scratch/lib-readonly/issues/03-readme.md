# 03 — README: the lib readonly option and the server enforcement line

Status: resolved

## Body

README only (single source of truth for the surfaces; SKILL.md is the CLI
contract and gains nothing):

- the lib/API section: `readOnly?: boolean` on `Store.open` — what it
  refuses (missing file, old schema), what it skips (WAL pragma,
  migration), what still works (all reads, doctor without fix);
- the HTTP server section: one sentence — ro aux mounts are now enforced at
  the lib level too (the middleware stays as the HTTP face).

## Answer

README, two spots (SKILL.md untouched — no CLI verb added):

- "How it works": a **Read-only stores** bullet — what readOnly refuses
  (missing file, out-of-date schema), what it skips (migration), what still
  works (reads; access_count untouched).
- "Multi-store": the isolation bullet now states the two layers — middleware
  as the HTTP face, lib-level read-only as the floor in local mode; token
  mode unchanged (per-token grants govern).
