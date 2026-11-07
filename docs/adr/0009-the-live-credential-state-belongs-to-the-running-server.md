# The live credential state belongs to the running server

A full-remote operator could `POST /stores/{name}/fork` but could not consume the
copy: the fork is born unreached (ADR 0006's singularity principle) and minting
the grant that would reach it was a host-local gesture — an edit of
`~/.souvenance/config.json` plus a restart. Minting was the one management
operation with no door on the wire. The verdict is the dev's, on the #48
grilling of 2026-11-07 (rulings 9–10, the "gestion full remote" requirement):
management is born on the wire — any new management operation lands on the
server's management surface first, remote-able through a management grant; the
manager keeps only what the wire cannot serve (the down state, the bootstrap,
offline surgery).

## The decision

- **The wire mints, lists and revokes the store family.**
  `POST /stores/{name}/grants {agent, mode}` authors the row — fresh secret
  (`souv-` grammar), the config file written at 0600, the row seated in the
  live credential state in the same synchronous gesture, so the mint is
  **effective immediately**: `fork → mint (ro) → consume` works with zero
  host-side gesture (a remote restart being chicken-and-egg). The response
  carries the row and its secret, **exactly once**.
  `GET /stores/{name}/grants` serves the rows, never the secrets.
  `DELETE /stores/{name}/grants/{agent}` revokes — immediate on both sources
  of truth.
- **Store family only on the wire.** `management[]` rows stay host-local: a
  management grant that mints management grants is recursive privilege; the
  host operator owns who manages.
- **The live credential state is the running server's.** The boot's families
  are copied into the server; every resolution walks that state, the file's
  credential rows are its echo, and every wire gesture re-authors the file
  from the state. The wire never recommits the file blind: it re-reads the
  raw rows, compares them to the state it staged the splice from, and
  **refuses on drift (409)** — external hand edits remain restart-to-apply,
  never silently merged, never silently erased by a mint in flight. A file
  that no longer parses refuses too (500, teaching; the live state is
  unaffected); the running state and the file both survive every refusal.
- **The write is the one-claim shape.** The spliced document faces the full
  config grammar before it lands (a persisted refusal would brick the next
  boot), is written whole to a scratch name created 0600, fsynced, then
  renamed over the config — the parent directory syncs behind the rename,
  and a post-rename failure notes the crash window on stderr rather than
  refusing (the file has already changed). A pre-existing looser file is
  tightened by a mint's first pass, and a reader never sees half a
  credential file.
- **The boot invariants hold at every swap.** One secret per row, both
  families pooled (the mint redraws on a collision); one row per
  (agent, store) — a duplicate mint is 409, its remedy taught: revoke, then
  mint (rotation and mode changes are a revoke away). Revocation is a plain
  removal; the in-memory swap cannot fail, which is why the routes stage
  nothing.
- **A deleted store's rows leave with it.** `DELETE /stores/{name}` revokes
  the `tokens[]` rows naming it before the removal — a wire delete can never
  leave a credential authored on a store the next boot refuses to open, the
  one state a full-remote operator could no longer repair. The order also
  keeps the route recoverable: if the removal fails after the revocations
  landed, a wire mint re-grants; the other order (rows surviving the
  deletion) is the unrecoverable one.
- **The manager refuses local credential writes while a server runs.** Its
  probe is the configured port's `/healthz`: a server on an overridden
  `--port` is invisible to it, and the manager's writes degrade to the
  restart-to-apply window of any hand edit — the escape is documented, not
  solved. A pidfile-based status (and `stop`) stays on the backlog.

## Considered options

- **Re-author the file from the live state** on every wire gesture (no drift
  check) — rejected: a hand edit made while running is silently erased; the
  recorded posture ("external hand edits remain restart-to-apply") dies.
- **Merge instead of refuse** (splice the wire's delta onto the hand-edited
  file) — rejected: the delta's shape (which row, which secret) is ambiguous
  against a hand's edits; resolving it silently is a guess in the one file
  where a guess is a credential.
- **A `server.json` of runtime state** (the bound port recorded at boot, the
  manager's probe robust to `--port`) — rejected for v0.2.0: a second
  stateful file to serve one flag's escape; the configured-port probe honors
  the rule with the window documented, and the backlog's pidfile work can
  improve it later.
- **Management rows mintable over the wire** — rejected: the wire's copy of
  the live state would mint the credentials that write the live state —
  recursive privilege; the bootstrap stays with the host's hands.
- **Mint as upsert** (a second mint on the pair re-grants) — rejected:
  silently replacing a secret is a revocation nobody asked for; rotation
  says what it does (revoke, mint).

## Consequences

- The served surface counts 17 paths / 22 methods (the number held at 13/17
  until ADR 0009; the data surface of ADR 0007 is untouched).
- The battery gains its phase E (`probes/grants/grants.ts`): the trio's gates,
  the mint's once-ness and 0600, the duplicate 409, the dream ceremony, the
  immediate revocation and rotation, the drift refusal, the rows riding a
  fresh boot, the delete-with-revoke.
- The manager CLI's grant family (#48 slice 3) teaches this door: while a
  server runs, the grant family refuses politely (the probe above) and
  points at the wire; with no server running it speaks the same mint and
  revoke offline. Its sequencing after this slice keeps its teaching from
  pointing at a route that does not exist.
- The down state has no wire: minting on a cold host stays the manager's
  bootstrap (one first management row, then the wire takes over), and a
  broken credential file blocks the wire's gestures (the teaching names the
  remedy) until the operator fixes it host-side.
- One config file per host-estate with one owner is assumed — the same
  posture the ownership lock arbitrates per store; a host-wide mechanism
  rides the backlog's pidfile work.
