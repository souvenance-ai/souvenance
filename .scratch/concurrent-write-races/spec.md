# Feature: Concurrent CLI write races (post-migration)

## Problem

Three same-day samples (2026-10-15) show that parallel `memory` CLI write
commands can fail even after the store is migrated and idle-quiet:

1. `database is locked` at store OPEN — three parallel `link` writes on an
   aged store; one invocation died there (CLI's open path is not wrapped in
   the library's BUSY retry).
2. Phantom `memory not found` — two parallel `update` writes on a migrated
   store; one invocation reported a missing id that was verified present on
   disk afterwards. Likely a WAL snapshot visibility question in
   open+write-under-contention; not yet diagnosed.
3. Control sample — three parallel `update` writes all succeeded.

Outcomes are nondeterministic, so reliability of parallel writes cannot be
assumed. Reads are unaffected (repeatedly verified).

## Hypotheses / Direction

- Add a `busy_timeout` pragma (or node:sqlite setting) at `Store.open` so the
  open path waits instead of failing — likely fixes shape 1.
- Diagnose shape 2 first: instrument open→get ordering for an `update` (or
  reproduce with a controlled writer transaction held open); the phantom
  must be understood before any patch, not papered over.

## Resolution (2026-10-15, session 2 — see issue 01 for full evidence)

- Shape 1 root cause: pragma ORDER. `execPragma` ran `journal_mode=WAL` before
  `busy_timeout`; fresh-store simultaneous opens raced on the WAL file-header
  grab without a busy handler. Fix: timeout first (24/24 vs 1-of-3 control).
  Regression test: `src/db.openrace.test.ts`.
- Shape 2: never reproduced across 9 probe designs; cause unknown. Reads
  before writes (`update`/`delete`/`link`/`deprecate`) now wrapped in the
  BUSY retry as prophylaxis.

## Decisions

- (2026-10-15) Policy update, sanctioned by evidence: CLI writes run
  sequentially in agent practice; only reads run concurrently. See the
  superseded → active "sequential writes" directive in the store.
- Fix implementation deferred to a fresh session (diagnosis loop);
  this spec records the state at handoff.
