# 04 — token policy: help overstates entropy ("64-hex not brute-forceable") vs a 16-char parser floor

Severity: low · Status: resolved

## The mismatch

- HELP (bin/souvenance.js:154-155): *"No rate limits: 64-hex bearer secrets are not brute-forceable and auth is per-request"*.
- Parser floor (server.ts:252): `/^[A-Za-z0-9_-]{16,}$/` — 16 chars of any alphabet mix. `aaaaaaaaaaaaaaaa` is a legal token.

There is no rate limiting, no failed-attempt delay, no lockout (a deliberate design, defensible for real 256-bit secrets). The doc claim is only true for the *recommended* generation (`openssl rand -hex 32`), not the *accepted* floor. A remote, unthrottled, 16-char lowercase-alphabet secret is squarely brute-forceable territory.

## Options (a Valentin decision)

- **A (recommended): raise the floor to 32.** `[A-Za-z0-9_-]{32,}` — still accepts every `openssl rand -hex 32` output (64 chars) and every sane passphrase; breaks nobody who followed the docs. Cost: one regex, one error message, one test fixture update.
- **B: keep 16, fix the doc.** State the floor and put the entropy recommendation in bold. Weaker boundary, honest text.
- **Either way**: the error message already suggests `openssl rand -hex 32` — good; keep.

A constant-delay on failed auth (e.g. 100 ms) was considered and is **not** recommended: it complicates the timing story that sha256+timingSafeEqual currently keeps simple, and buys little once the floor is 32+.

## Related note (no action)

`parseTokenFile` enforces 0600 but `--token` inline secrets ride argv (`ps aux`, `/proc/<pid>/cmdline`) — documented, token-file is the offered mitigation; HELP says so. Fine as is.

## Resolution

Valentin proposed STRUCTURED tokens over a numeric floor (decision c88a9a61). Tokens are now `souv-` + 32-64 lowercase hex chars (128-256 bits), enforced by parsing — no legacy acceptance (first npm publish hasn't happened; VPS mirror tokens rotate at the next redeploy). Help + README rewritten; auth/tokenfile tests updated; a bare-hex secret is rejected by construction.
