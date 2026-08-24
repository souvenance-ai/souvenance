# Integration test and gitignore

Type: task
Status: open
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
