# The grant is the store's address

The data surface drops the `{name}` path segment. The twelve data routes go
bare root — `/memories` (list, create), `/memories/{id}` (get, supersede,
deprecate, hot, link, unlink), `/search`, `/merge`, `/checkin`, `/checkout` —
and the **store grant is the only address a data call carries**. The verdict is
the dev's, on the grilling of 2026-11-02 (#73), implemented by #74: a store
grant already pins exactly one store, so the path's `{name}` carried no
decision the token had not already made — and the reach cross-check it fed
(refusing every other name 403 before existence was spoken) was an oracle
naming which stores exist.

## The decision

- **Bare-root data routes.** No collision with the discovery doors
  (`/`, `/healthz`, `/doc`, `/docs`, `/openapi.json`) nor with the management
  surface, which keeps `/stores*` — names are its subject. An old-shape URL
  degrades to the teaching 404.
- **One Bearer = one store, pinned at both layers.** The config already
  refuses a secret naming two rows (the duplicate-secret walk, #63); the
  nameless wire is what that uniqueness is _for_ — a duplicated secret would
  be un-addressable, so the walk graduates to the programmatic boot too
  (`startServer` refuses, same teaching): one invariant, both doors.
- **The foreign-403 family dies.** No path segment means no other store to
  name, nothing to guess, no oracle. The refusals a data route can still
  serve: the family gate (403 — a management grant reaches no store's data),
  the registry's existence (404 — the orphaned grant, its store deleted
  mid-run by management, is the one shape that serves it), and the mode gate
  (403 ro).
- **`agent` stays on the grant.** The attribution axis is orthogonal to
  addressing; once the path stops naming the store, the request log's `agent`
  column (#69) is the only caller label left — the dev floated dropping it and
  the code argued back (#73, verdict 2).
- **The re-activation handover collapses to base URL + bearer secret.** The
  individual never learns its store's label: nothing on the wire names it
  (descriptors are management-only; the data surface is nameless).

## Considered options

- **Keep `{name}`** (the status quo) — rejected: pure redundancy on the data
  routes; the URL re-states what the Bearer already pinned.
- **One Bearer = N stores** (the multi-store token, a supervisor persona) —
  rejected for v0.2.x and registered on the backlog (#28): it re-adds `{name}`
  to the data routes (a breaking URL re-design of this very surface), returns
  the foreign-403 oracle, and grows the waking line back to base URL + secret
  - the addressable names. The multi-grant posture serves the same persona
    today: N rows, one per store, revoke per terminal, blast radius one store.
- **The config as a directory** (`tokens` keyed by the secret) — weighed and
  retired with `agent`'s survival: as value metadata the directory bought file
  ergonomics only, and the array grammar already refuses the ambiguous state
  at both doors.

## Consequences

- Every URL, the request log's `path` column, and /doc's route table shorten;
  the served /doc re-pins to the same 13 paths / 17 methods (the count holds —
  the names moved, not the count).
- The battery pins the old-shape URL's teaching 404 (phase C) — the old scheme
  degrades, never silently serves.
- A future multi-store token is the breaking URL re-design this ADR names: the
  price is recorded, the analysis lives on the backlog (#28).
- The naming asymmetry is deliberate and permanent for v0.2.x: management
  routes speak store names; data routes speak none.
