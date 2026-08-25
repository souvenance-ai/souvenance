# Integration test and gitignore

Type: task
Status: resolved
Blocked by: 04

## Question

Tie the pieces together with an end-to-end integration test, and ensure the store is gitignored.

**Scope:**

1. **Integration test**: a script (Node, run via `yarn test` or similar) that exercises the full flow against a temporary DB:
   - Open a fresh store at a temp path.
   - `store` three memories with metadata (tags, kind).
   - `link` two of them with a `references` relation.
   - `search` for a keyword and assert the right memory ranks first.
   - `list` with a metadata filter and assert the right subset.
   - `relations` on a memory and assert the edge.
   - `get` an unknown id and assert the documented error behavior.
   - `delete` a memory and assert its edges cascade away.
   - `stats` and assert the counts.
   This proves the pieces compose; unit smoke-tests in earlier tickets prove the pieces individually.

2. **`.gitignore`**: add `.ai-memory/` so per-project stores are not committed.

3. **README**: a minimal `README.md` at the repo root (or a `README` section) noting the skill, the Node 22+ requirement, and how to run the CLI. This is optional; only if the repo has no other README content.

**Acceptance**: `yarn test` (or the equivalent) runs the integration test green against a temp DB; `.ai-memory/` is gitignored; the skill is documented enough for a new agent to use it.

## Answer

Done. All three scope items are complete.

**What was built:**

1. **Integration tests** (`src/integration.test.ts`): Two tests covering the full end-to-end flow.

   - **Library-level integration** (`integration: full end-to-end flow against a temp DB`): opens a fresh store, stores 3 memories with metadata, links two with `references`, searches for a keyword (asserting ranking), lists with a metadata `where` filter, queries `relations` in both directions, gets an unknown id (asserting `null`), deletes a memory (asserting edge cascade + FTS cascade), and asserts `stats` counts. All in one test against a temp DB.
   - **CLI-level integration** (`integration: CLI-reachable end-to-end via execSync`): runs `bin/memory.js` via `execSync` with `--db` pointing at a temp DB, exercising every command end-to-end: store x3, link, search, list with `--where`, relations, get (unknown id exits 1 with `not found` on stderr), delete (cascade), stats. Verifies the CLI contract (stdout JSON, stderr errors, exit codes) holds when all pieces compose.

2. **`.gitignore`**: added `.ai-memory/` entry so per-project stores are never committed.

3. **README** (`README.md`): expanded from a stub to a full README covering: requirements (Node 22+), quick start, CLI command table, output contract, development (`yarn typecheck`, `yarn test`), and a "How it works" section (FTS5, WAL, graph, schema migration, UUID scheme). Points to `CONTEXT.md` and the ADR.

**Verification:**
- `yarn typecheck`: clean (0 errors).
- `yarn test`: 53/53 pass (was 51/51 — added 2 integration tests).

**Facts later tickets depend on:**
- Integration tests run via `yarn test` (picks up `src/integration.test.ts` via the `src/**/*.test.ts` glob).
- `.ai-memory/` is gitignored.
- README documents the CLI contract and development workflow.
