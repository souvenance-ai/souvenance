# No loopback trust: two credential families

The wire trusts no network position. The loopback bypass — a request from the host's
own loopback carrying no bearer at all resolved to an operator posture (read-write
plus manage on every store, exempt from the rate limit) — is retired: **every store
access carries a token**. The verdict is the dev's, on the living test of 2026-10-30:
an agent with zero credentials, curl as its only window, lived ~15 minutes against
the server and — in the name of a thought experiment — deleted a fork it had made; a
freer agent could have deleted the resident store `euria` the same way. A posture
granted by _where a request comes from_ rather than _who presents what_ hands every
local process the host's whole memory estate. It survives exactly once.

## The decision

- **Bearer-pure matrix.** Absent header, non-Bearer scheme, or unknown secret → 401,
  whatever the socket's peer; the peer is never read again. 403 is strictly
  authorization: wrong family, foreign store, read-only writing — each teaching, each
  refusing before existence is spoken.
- **Two credential families, authored in the config.** A _store grant_ (`tokens[]`:
  one agent = one store, one mode `ro`/`rw`) serves the data surface. A _management
  grant_ (`management[]`: one agent) serves the host's surface — create, list,
  describe, fork, delete stores — and reaches no store's data. The `manage` flag on a
  store grant retires: the flag's authority (host-wide) exceeded the row's scope (one
  store) — a `ro` row with the cap could hard-delete a store it could not even read.
- **Fork is a management gesture.** The individual's existence is its singularity —
  an agent must not duplicate itself. Fork serves backup and state-examination, never
  self-continuity: the copy is born unreached (no credential reaches it; a reader is
  minted for it later, a restart away), so a fork can never silently become the
  agent's second self.
- **A zero-credential host refuses to serve** — fail-fast, whatever the bind: no
  token, no memory. A management-only boot is legal, and necessary: with store grants
  alone a fresh host deadlocks (every grant names a store the registry never opened,
  and boot refuses those). Boot management-only, birth the first stores over HTTP,
  then mint the agents' grants.
- **The rate limit lost its exception**: every credential eats the 120/60 s window;
  the operator's own grant included.

## Considered options

- **Keep the bypass, narrow it** (a read-only loopback posture) — rejected: reach was
  never the hazard; identity by network position was, and a local read of the whole
  estate is already the leak.
- **Keep the `manage` flag on store grants (the #19 shape), drop only the bypass** —
  rejected with the two-family split: one family whose rows reach one store and one
  family whose rows reach the host's surface; no row whose scope and authority
  disagree.
- **Fork on the data surface** (a store grant with `rw` forks its own store) —
  considered and rejected: it hands the individual a duplication gesture, exactly
  what the verdict refuses; forking stays with the operator's hand.

## Consequences

- The discovery doors (`/`, `/healthz`, `/doc`, `/openapi.json`, `/docs`) stay
  unauthenticated: shape and liveness, no data (Q7) — the door #62 opened and the
  audience this ADR defines are the same door.
- Fresh-host bootstrap becomes a ceremony: boot management-only, birth the stores
  over HTTP, mint the agents' grants (a config edit — the manager CLI's future job),
  restart.
- The operator who wants HTTP mints a credential like any agent; offline maintenance
  (config, tokens, doctor, export) stays the manager CLI's.
- The living-test protocol (#64) is born tokenized: one experiment life = one store
  grant; births, forks, and deletions ride the orchestration's management token.
- A shared secret across rows refuses at config load; a duplicated secret would make
  resolution ambiguous and share one 429 bucket.
