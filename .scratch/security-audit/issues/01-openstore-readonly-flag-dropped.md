# 01 — bin openStore drops the readOnly flag: ro mounts open writable and silently migrate

Severity: high · Status: resolved

## The defect

`src/server.ts` passes the readOnly decision to the injected factory — `openStore(d.dbPath, !tokenMode && d.mode === "ro")` (server.ts:901) — and documents the contract (server.ts:892-894): *"in local mode a ro-declared mount ALSO opens the store itself read-only at the lib level (decision 675f18a8): the middleware is the HTTP face with the hint, the lib guard is the floor."*

The bin's implementation drops the second argument:

```js
// bin/souvenance.js:464
const openStore = (dbPath) => {
  const s = Store.open({ dbPath });   // readOnly ignored — always rw
  auxiliaries.push(s);
  return s;
};
```

## Why it matters

1. **The documented lib-level floor does not exist on the only production wiring.** Tests inject their own `openStore` (server.ro.test.ts:58 honors the flag; server.test.ts:387 ignores it in a spy), so the suite cannot see the bin's behavior. No integration test spawns `serve` with a ro mount.
2. **A ro mount silently MIGRATES its target store.** `Store.open` (rw) runs `migrate(db)` on open — a write to a file declared "served exactly as its owner left it". The ro open path exists precisely to refuse that (`readOnly: true` skips migration and refuses an older schema, db.ts:151-169). Serving someone else's store read-write against the declared mode is the worst kind of side effect: invisible until their schema version moves.
3. **Defense in depth lost.** Only the HTTP middleware guards writes on ro mounts; any future routing bug turns into a write path onto a foreign store.

## Fix

```js
const openStore = (dbPath, readOnly) => {
  const s = Store.open({ dbPath, readOnly });
  auxiliaries.push(s);
  return s;
};
```

Plus an integration test: spawn `bin/souvenance.js serve` with `--store ro-mount=<old-schema.db>` (fixture at schema v4), issue a GET, expect the request to fail with the ro-open refusal ("open it read-write once to migrate") and the target file's schema_version untouched.

## Note

In token mode mounts intentionally open writable (per-token auth governs; server.ts:895-901) — the fix must pass the flag through, not hardcode readOnly.

## Resolution

bin/souvenance.js openStore now passes `(dbPath, readOnly)` straight into `Store.open` (flag threaded, not hardcoded — token mode still opens writable). Exercised by `src/bin.wiring.test.ts`: the real bin spawns `serve` with a downgrade-to-v4 ro mount; the request is refused, the stderr log carries the real text, `MAX(schema_version)` stays 4, and a current-schema ro mount serves reads while POST stays 409.
