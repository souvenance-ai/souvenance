# 01 — one-gesture writing: `--relation <kind>:<uuid>` on store/supersede

Type: task
Status: ready-for-agent
Spec: see `../spec.md`, leg 1

- Lib: `StoreOptions.relations` on `store` + `supersede`; the outgoing
  edges created in the same call; per-edge validation identical to
  `link` (memory not found / empty kind) — shared body, no duplicate SQL.
- CLI: `--relation <kind>:<uuid>` repeatable, full uuids only, on the two
  verbs; help lines + the Notes block (syntax, direction = outgoing,
  supersede applies to the NEW memory).
- Parity: MCP inputSchema `relations` (array of {to, kind}) on the two
  tools; HTTP bodies `relations: [{to, kind}]` on POST /memories +
  POST /memories/:id/supersede.
- The `link` verb unchanged and still documented beside it.
- Tests: lib (edges land atomically, invalid to/kind refuse, self-edge
  lands and doctor flags it), CLI contract (spawnSync), MCP round trip,
  HTTP bodies (201 + the relations readable via GET relations).

## Resolution

(agent-side — lands in the arc's single bump PR)
