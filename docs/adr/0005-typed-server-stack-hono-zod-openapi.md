# The typed server stack: Hono + zod-openapi, one schema set

The v0.2.0 server is the agent-facing surface (ADR 0002), so its HTTP layer must serve
both the wire and its own documentation from a single source of truth. We build it on
**Hono ^4.13** with **@hono/node-server** and **@hono/zod-openapi ^1.0** over **zod ^4**:
one schema set validates every request and generates the OpenAPI document — `/doc`
serves the spec, `/docs` the UI. The framework is small, standard-shaped (Web API
`Request`/`Response`), and its testing story (`app.request()`, no socket) keeps the
endpoint suite fast and deterministic. Fastify and Express were rejected: their schema
and documentation layers are second frameworks beside the validator, exactly the
divergence the one-schema rule exists to kill.

## Considered options

- **Fastify** — mature, fast, JSON-schema-native; rejected: its OpenAPI support is a
  bolt-on dialect (JSON schema ≠ zod), two schema vocabularies to keep honest.
- **Express** — the default choice by inertia; rejected: middleware-era API, no schema
  story at all, and a router model that would have us hand-writing every route doc.
- **Hand-rolled (v0.1 carry-over)** — the legacy server already ran Hono without the
  OpenAPI layer; rejected as the end state: agents integrating against the surface
  need a machine-readable contract, not a README.

## Consequences

- Refusals are typed end to end: the store raises `StoreError` codes, the server maps
  code → status once (`400/404/409/503`), and no consumer regex-matches error messages
  across a module boundary.
- The spec is code: the endpoints' zod schemas are the documentation, and `/doc` cannot
  drift from what the routes accept.
- The stack pins the runtime contract: `@hono/zod-openapi` requires zod ^4 and
  hono >= 4.10 — both already ours, no version debt taken.
