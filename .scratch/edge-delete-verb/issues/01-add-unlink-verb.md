# 01 — add the `unlink` verb (edge removal across CLI/MCP/HTTP)

Type: task
Status: ready-for-agent
Spec: see `../spec.md`

Live-found during the evening dream (2026-10-21): the dream's authoring linked by search-by-prefix — FTS matched the QUOTING memory (the dream itself cites the target ids in its Links section) instead of the quoted. A self-edge and wrong-target edges had to be repaired by deleting and re-storing the whole dream, because nothing removes a single edge: `link` creates, only whole-memory `delete` cascades.

Real-world cost of the gap: a mistyped `link` (transposed uuids, wrong kind) is PERMANENT today, and repair-by-delete amplifies the blast radius (whole memory + all its other edges). The library may already have the verb or the SQL shape — check `Store` first (the deep module), then wire surfaces per the parity law.

Also worth doing in the same ticket if cheap: a doctor check for self-edges (`from_id = to_id`) — the store tolerated one until a delete repaired it.
