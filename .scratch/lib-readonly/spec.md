# Spec: lib readonly mode

The lib-level read-only store. `Store.open({ readOnly: true })` opens an
existing store for reading only — no directory/file creation, no migration,
no writes. The demand-driven deferral ("no lib-level readonly mode, no
consumer yet" — decisions 5e3bb21f, b79c09d4) resolves now that Valentin
called for the work (2026-10-17).

## Contract

- `OpenOptions.readOnly?: boolean` (node:sqlite's vocabulary — the flag maps
  to `new DatabaseSync(path, { readOnly: true })`).
- Strict open (refuse-don't-hide):
  - missing file → clean `no store at <path>` error; never create anything;
  - schema version below `SCHEMA_VERSION` (or a pre-versioning store,
    version 0) → refuse with an "open it read-write once to migrate" hint.
- Pragmas on ro: `busy_timeout` + `foreign_keys` only. `journal_mode = WAL`
  is skipped — a readonly connection cannot switch journal mode.
- Write guard is per-verb (`assertWritable()` at entry of store, supersede,
  merge, update, delete, deprecate, link, and `doctor({fix:true})`), NOT in
  `run()` — `run()` also carries the read-signal updates and the doctor's
  VACUUM INTO snapshot, both legitimate on ro stores.
- Read-signal (`access_count` bumps in search/get) skipped silently on ro:
  a read stays a read.
- Consumer: the server's ro aux mounts. `openStore` factory gains a
  `readOnly` param; the default factory passes `mode === "ro"` down. The 409
  middleware stays as the HTTP face; the lib is the floor. `statusFor` maps
  the lib readonly error to 409.

## Rejected

- CLI `--readonly` flag, MCP ro mount: no demand today (defer on appearance).
- A `Store` subclass for ro: two classes for one mode.
- Serving an old-schema store silently: refuse-don't-hide house style.

## Issues

- `issues/01-lib-readonly-core.md` — the lib capability + tests.
- `issues/02-server-ro-mount-wiring.md` — server consumer wiring + tests.
- `issues/03-readme.md` — README (lib option + server enforcement wording).
