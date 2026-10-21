# 02 — store files created world-readable (0644): the identity readable by any local user

Severity: medium · Status: resolved

## The observation

The live dogfood store:

```
644  archive.db  816.0K
644  memory.db   980.0K
```

`Store.open` (rw path) does `mkdirSync(dirname)` + `new DatabaseSync(dbPath)` with no permission tightening (db.ts:171-172); SQLite WAL/`-shm` sidecars inherit the same regime. Forked stores (`VACUUM INTO`) land at the process umask too.

## Why it matters

The codebase already holds the principle: `parseTokenFile` refuses a group-readable token file because *"bearer secrets in a shared-readable file void the boundary"* (server.ts:275-277, enforced). The store file contains strictly more sensitive material — the agent's whole identity: directives, decisions, conversation transcripts (the bilingual originals), and anything a session ever learned that looks like a secret. On a multi-user host — **the VPS mirror runs this product** — 0644 hands every local account a read path onto every mounted store.

## Options (a Valentin decision)

- **A (recommended): the lib tightens its own files.** After a rw open, `chmod(dbPath, 0o600)` (skip when the file already exists with looser perms? No — tighten unconditionally, same refuse-don't-hide spirit; apply to fork targets too). Read-only opens never chmod (not our file). One line in `Store.open`, one in `fork`, tests for both.
- **B: document-only.** README security section: "run behind a single-user account or set a strict umask." Weaker — the same argument that made the token-file check mechanical applies here.

Triage question: does anything legitimately read another user's store? (The archive fork is Valentin's backup software's file — a 0600 default is still correct there; his backup software runs as him.)

## Boundaries

Do not chmod on readOnly opens; do not walk directories (the db file and its own sidecars only — `-wal`/`-shm` are recreated by SQLite at open, tightening the db + umask guidance covers them, or chmod them if present).

## Resolution

Valentin chose the lib-level fix (option A). `tightenPermissions` (src/db.ts) chmods the db + `-wal`/`-shm` sidecars to 0600 after a rw open and after `fork` (best-effort, win32 skipped); the doctor's 11th check `file_permissions` reports any drift; help + README document the behavior. Verified on the dogfood store (`memory.db` now 0600). Valentin's `archive.db` tightens only when a souvenance process opens it — his backup software is never touched out-of-band.
