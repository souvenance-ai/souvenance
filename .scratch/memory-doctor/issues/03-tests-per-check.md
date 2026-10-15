# 03-tests-per-check

Type: grilling
Status: resolved
Blocked by: 01

## Question

How are the doctor checks tested? Each check catches a defect class that the CLI itself prevents (FK blocks orphans, CLI writes always create bridges) — so corrupt fixtures cannot be built through the public API.

## Answer

One test per check in `src/db.doctor.test.ts` (~9 tests) plus a clean-store test and a `--fix` path test. Fixtures are corrupted with **direct SQL on `store.db`** inside the test setup — the same channel hand-edits would use, which is exactly the population each check exists to catch.

### Per-check fixture

- `broken_links`: store two memories, `UPDATE` content to point at a nonexistent uuid.
- `orphan_edges`: `INSERT` an edge row referencing a missing id (FK must be deflected — disable `PRAGMA foreign_keys = OFF` for the corrupting statement, matching a hand-edit scenario).
- `active_without_kind`: `UPDATE memories SET metadata = NULL`; second fixture: metadata `'{"tags":[]}'` (present but kindless).
- `weight_bounds`: `UPDATE … SET weight = 1.5` (out of bounds); directive with weight 0.7 (below the 0.8 floor).
- `invalid_metadata_json`: `UPDATE memories SET metadata = 'not json'`.
- `status_without_bridge`: `UPDATE memories SET status = 'superseded'` without creating a bridge edge.
- `isolated_active`: store a memory, link nothing.
- `duplicate_titles`: two actives with identical `# Title` first line; a superseded predecessor sharing the title must NOT trigger it; two heading-less memories must NOT group.
- `fts_integrity`: `DELETE` a memory row bypassing the FTS trigger (`DROP TRIGGER` + re-create, or `PRAGMA writable_schema`-free approach: delete via a second connection with triggers dropped) → rowid drift; and the snapshot `integrity-check` path exercised directly.

### Assertions

Healthy store → `healthy: true`, zero findings, summary counts coherent. Corrupt store → exactly the expected finding (`check` name + implicated `id`), other checks stay silent. `--fix` test: corrupt FTS, `doctor({fix: true})` → `fts_rebuilt: true`, `healthy: true` after.

### Rationale

- **One test per check**: each check already caught a real defect class in the wild or by construction; the contract deserves individual coverage so a future regression names its check.
- **Direct-SQL fixtures**: the CLI API is *designed* to prevent these states; only SQL reaches them, and that is also how they occur in practice (hand edits, older schemas).
- **Negative controls** (superseded title-sharer, heading-less pair): pin the audit's false positive as a regression test.

### Rejected

- **Smoke test only** (one healthy + one multi-defect store): single-failure attribution is lost — when a check regresses, the smoke test cannot say which.
- **Fixture files on disk**: dead data divorced from the schema version; inline SQL self-documents the corruption.
