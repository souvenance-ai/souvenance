# 01 — Diagnose and fix parallel-write contention shapes

Status: shape-A-diagnosed-and-fixed / shape-B-not-reproduced

## Spec

Two observed failure shapes, both nondeterministic (same-day samples 2026-10-15,
details in `../spec.md`):

- Shape A: `could not open store: database is locked` — parallel CLI writes on
  a migrated store; one open loses the race.
- Shape B: phantom `memory not found` — one parallel `update` on a migrated
  store read as if the row were absent, while it was present on disk after
  the run (snapshot phantom).

Deliverable: root-cause BOTH shapes (instrument or controlled reproduction;
shape B must be understood, not patched blindly), then fix in the library so
the CLI's open path and any unwrapped read-before-write path are safe under
parallel writers. Keep reads concurrent (WAL) and do not serialize reads.

## Diagnosis (2026-10-15 session 2)

**Shape A: root cause KNOWN and FIXED.**

- The repro loop was the missing piece for a day: 9 stress designs (~1,500 CLI
  invocations) stayed clean until the simultaneous-gate design fired N real CLI
  opens at the SAME wall-clock instant on a FRESH store. Under that gate the
  failure rate was stable at 2-of-3 per round (sample: one id stored, two
  `error: could not open store: database is locked`).
- Root cause: `execPragma` (src/db.ts) ran `PRAGMA journal_mode = WAL` BEFORE
  `PRAGMA busy_timeout = 5000`. On a fresh store the WAL journal-mode swap
  needs an exclusive file-header lock, and the busy handler did not exist yet,
  so racing opens lost the grab immediately with SQLITE_BUSY. On stores already
  in WAL the pragma is a no-op (no lock needed), which is why every aged-store
  probe stayed clean — the bug only lives in the fresh/unwal window.
- Phase-probe evidence: three connections opened at one gate; all three threw
  exactly at `PRAGMA journal_mode = WAL: database is locked`, then continued
  through the remaining statements normally.
- Fix (one-variable change, src/db.ts `execPragma`): `busy_timeout` first,
  then `journal_mode = WAL`, then `foreign_keys = ON`. Control run (HEAD, old
  order): 1 surviving row per round of 3 simultaneous opens × 5 rounds.
  Fixed run: 24/24 successful opens × 8 rounds, zero lock errors.
- Regression test locked in `src/db.openrace.test.ts` (spawns gate-aligned CLI
  children against one fresh db; asserts all stores succeed).

**Shape B: NOT reproduced. Root cause remains UNKNOWN.**

- Hunted with: in-process held-writer probe (textbook MVCC: select sees the
  row, update blocks then throws SQLITE_BUSY after timeout — node:sqlite does
  NOT mask BUSY reads), 25×13 randomized command lattice, aged-store stress,
  degraded-state replicas (test.db + real store with orphan -wal/-shm), heavy
  sustained writers, gated simultaneous `update` waves on aged stores and on
  a contiguous replica of the REAL store (90/90 and 60/60 clean).
- Working suspicion (unproven): the observed phantom command mix was more
  exotic than two parallel `update`s on one known id (the only sample detail)
  or ran against the then-unticketed same-window as shape A's open race.
- Hardening shipped alongside as prophylaxis: `update`, `delete`, `link` and
  `deprecate` pre-check reads are now wrapped in the library's BUSY retry
  (`run`), so a transient busy on those paths can no longer surface as an
  abrupt error.

## Comments

Claimed 2026-10-15 for diagnosis only; implementation delivered the same day
(next session, nine probe designs, one gate design that worked). If shape B's
original command mix resurfaces, re-run the shape-B lattice from
`/tmp/opencode/races/` procedures (gated simultaneous CLI invocations) with
that exact mix before patching anything fresh.
