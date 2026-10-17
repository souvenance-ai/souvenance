# 02 — server: ro aux mounts open lib-readonly (defense in depth)

Status: resolved

## Body

`src/server.ts`:

1. `MultiStoreOptions.openStore` type → `(dbPath: string, readOnly: boolean)
   => Store` (existing `(dbPath) => Store` factories remain assignable).
2. Default factory → `(dbPath, readOnly) => Store.open({ dbPath, readOnly })`.
3. The lazy resolve passes `d.mode === "ro"`.
4. The 409 write-guard middleware STAYS (it is the HTTP face with the hint);
   the lib guard is the floor.
5. `statusFor` maps `^store is read-only` → 409.

Tests:

- a ro mount opens its store with readOnly=true and a rw mount with
  readOnly=false (captured via an injected factory);
- a ro mount still serves reads (search 200) and still 409s writes;
- `statusFor` grid line for the readonly message.

## Answer

Shipped in `src/server.ts`:

- `openStore?: (dbPath, readOnly) => Store` — one wrinkle found while
  wiring: in TOKEN mode the increment-4 semantics must survive (a ro-DECLARED
  mount opens writable; per-token grants govern writes). The caller decides:
  the resolve passes `!tokenMode && d.mode === "ro"`, so only local-mode ro
  mounts open lib-readonly. The default factory forwards both args.
- The 409 middleware stays (HTTP face with the hint); the lib guard is the
  floor behind it.
- `statusFor`: `^store is read-only` → 409 (serving-mode conflict family).

`src/server.ro.test.ts`: 3/3 — captured factory args (ro=true / rw=false),
ro mount serves reads + 409s writes, statusFor grid line. Full suite
260/260, tsc clean.
