# 01 — add the `unlink` verb (edge removal across CLI/MCP/HTTP)

Type: task
Status: resolved
Spec: see `../spec.md`

Live-found during the evening dream (2026-10-21): the dream's authoring linked by search-by-prefix — FTS matched the QUOTING memory (the dream itself cites the target ids in its Links section) instead of the quoted. A self-edge and wrong-target edges had to be repaired by deleting and re-storing the whole dream, because nothing removes a single edge: `link` creates, only whole-memory `delete` cascades.

Real-world cost of the gap: a mistyped `link` (transposed uuids, wrong kind) is PERMANENT today, and repair-by-delete amplifies the blast radius (whole memory + all its other edges). The library may already have the verb or the SQL shape — check `Store` first (the deep module), then wire surfaces per the parity law.

Also worth doing in the same ticket if cheap: a doctor check for self-edges (`from_id = to_id`) — the store tolerated one until a delete repaired it.

## Resolution

DONE (2026-10-21, branch unlink-verb, PR with bump 0.1.3 — Valentin's merge releases it).

- Lib `Store.unlink(fromId, toId, kind?)` (src/db.ts): single-edge removal, no cascade, no edge update (addition-only spirit — recreate right instead). Endpoint existence is checked FIRST so a transposed id reads as `memory not found: <id>`; kind-less removal refuses ambiguity with the candidate kinds (`ambiguous: N edges between A and B, pass --kind: ...`), names reverse-direction edges to catch transposed pairs, and removes the lone edge of an unambiguous pair without ceremony. Read-only stores refused like every write.
- Error-to-HTTP mapping (server.ts statusFor): `edge not found:` -> 404, `ambiguous:` -> 409 (both would have fallen to 500 through the generic 400 regex — mapped explicitly before it).
- Surfaces per the parity law: CLI `unlink <from-id> <to-id> [--kind <kind>]` (help + dispatch, prints "unlinked"); MCP tool `unlink` (from/to required, kind optional); HTTP `DELETE /memories/:id/link` (`{to, kind?}`, mirrors the POST link shape).
- Doctor check `self_edges` (DoctorCheck extended in types.ts): finding per `from_id = to_id` edge, hint = the exact unlink command; repair verified doctor-clean in tests.
- Tests +12 (303/303): lib round trip/ambiguity/refusal/endpoints/reverse-hint/empty-kind/read-only (writes.test.ts); self_edges detect + unlink repair (db.doctor.test.ts); HTTP 200/409-with-candidates/404/missing-endpoint (server.test.ts); MCP round trip + transposed + ambiguous + explicit kind (mcp.test.ts); real-bin wiring link/unlink/ambiguous exit 1 with candidates on stderr, no stack (bin.wiring.test.ts).
- Docs: README command + HTTP tables, output sentence, SKILL.md CLI one-liner + output sentence.
