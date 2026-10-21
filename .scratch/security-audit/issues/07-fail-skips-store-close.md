# 07 — fail() calls process.exit: finally never runs, store never closed on error paths

Severity: info · Status: resolved

## The observation

```js
// bin/souvenance.js:202-205
function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}
```

`process.exit` terminates immediately — the `try/catch/finally` in `main` (bin/souvenance.js:517-522) never reaches its `finally`, so `store.close()` and the auxiliary closes are skipped on every error path (bad args, lib errors, unknown commands). Consequences: WAL/`-shm` sidecars left uncheckpointed (SQLite recovers cleanly on next open — no corruption, just litter), open handles until the process dies, and a signal-shaped exit that confuses tests.

## Fix

Make `fail` non-leaning:

```js
function fail(msg) {
  throw new FailError(msg);            // class FailError extends Error {}
}
```

In `main`'s catch: if `err instanceof FailError` → stderr + `exitCode = 1` (letting `finally` run); else rethrow-or-fail as today for true surprises. The exit-code contract (0/1, `error:` on stderr) is unchanged; the `exit(1)`-after-finally pattern already exists in the file (`exitCode` for doctor/finish, bin/souvenance.js:228-230, 523).

## Test

Existing suite covers CLI behavior end-to-end; assert only that `bin/souvenance.js list --db /nonexistent-parent-path/store.db` still prints `error: …` and exits 1 (no behavior change), and manually confirm no `-wal` litter after a failed command on a temp store.

## Resolution

`fail()` throws `FailError`; main() has one try/catch/finally — errors print `error: ...` to stderr, exit code 1 fires AFTER the finally closes the store (bin/souvenance.js). Exercised in src/bin.wiring.test.ts: a failing merge prints one error line, exits 1, no stack trace.
