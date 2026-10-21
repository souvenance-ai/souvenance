# 03 — 500 responses leak internal error messages (filesystem paths) to remote clients

Severity: low · Status: resolved

## The defect

```ts
// src/server.ts:911
app.onError((err, c) => c.json({ error: err.message }, statusFor(err)));
```

Status 500/503 bodies carry `err.message` verbatim. Real leak paths over a token-mode (remote) connection:

- Lazy auxiliary open failure: `Store.open` rw surfaces SQLite/`mkdir` ENOENT messages containing absolute server paths ("no store at …" is the ro path, but `SQLITE_CANTOPEN` / `EACCES` messages embed paths).
- `database is locked` → 503 with raw SQLite text (benign), but BUSY-exhaustion messages can carry table/statement fragments.
- Any future lib error text assumed local.

In local mode (loopback) the exposure is nil — the finding targets the internet-facing path the arc is about to open (phase 6, memory.souvenance.org already runs token-gated).

## Fix

For statuses where the server (not the lib) decided nothing meaningful can be returned to a remote agent — 500 and 503 — return a generic body (`{ error: "internal error" }`) and `console.error` the real message to stderr (the operator's log). Keep 4xx verbatim: those messages are the API contract (validation hints, FTS syntax help).

Mapping: in `onError`, compute `statusFor(err)`; when ≥ 500 → generic body + stderr log; else current behavior. Update `server.test.ts` expectations if any assert on 500 bodies.

## Test

Unit: a store whose `search` throws `new Error("SQLITE_CANTOPEN: unable to open /home/secret/path")` → response body contains no path fragment; stderr does.

## Resolution

`app.onError` routes any status >= 500 to a generic `{error: "internal error"}` body with the full error (stack when present) on stderr (src/server.ts). Test in src/server.test.ts: a closed-store request yields the generic body while the patched console.error carries `database is not open`.
