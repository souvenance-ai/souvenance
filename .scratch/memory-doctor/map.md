# Map: Memory Doctor

## Destination

A `memory doctor` CLI command that validates the store's own integrity — the checks proven by the 2026-10-15 audit — and reports findings, so store health is one command away instead of an ad hoc /tmp script. Diagnoses only; content repairs stay supersede-style decisions.

## Notes

**Domain**: ai-memory skill (`src/db.ts`, `src/types.ts`, `bin/memory.js`, `SKILL.md`). `CONTEXT.md` for the glossary.

**Origin**: audit of 2026-10-15 (memory 2f8333f2) validated the real store healthy (10 checks, 1 content glitch repaired via supersede). Reference implementation preserved at `audit.mjs` beside this map — the seed the tickets cite.

**Decision ancestor**: "server deferred — memory-core first" (decision aee69c6e-2194-4885-8051-8398b8ade7f2).

**Skills every session should consult**: `grilling` for the design rounds; `tdd` if tests are wanted alongside.

**Standing preferences (Valentin, 2026-10-15)**: features go through grilling, fixes direct; commit when green; concise reports.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Store doctor API](issues/01-store-doctor-api.md): One `doctor(opts)` on Store; 9 finding-producers + edges-stats block; findings `{check, id?, detail, hint}`; FTS via `VACUUM INTO` snapshot, never a write lock on the live store; active-only scoping for kind/weight/isolated/titles.
- [CLI command and docs](issues/02-cli-command-and-docs.md): `memory doctor [--fix]`; JSON report via `print()`; exit 1 on findings (set after close, stderr empty); `--fix` = FTS rebuild only; docs in HELP + SKILL.md (dream step) + README (incl. the missing `export` row).
- [Tests per check](issues/03-tests-per-check.md): `src/db.doctor.test.ts`, one test per check (~9) + clean-store + `--fix` path; fixtures corrupted by direct SQL; negative controls pin the audit's false positives (superseded title-sharer, heading-less pair).

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

_Filled as grilling rounds resolve._
