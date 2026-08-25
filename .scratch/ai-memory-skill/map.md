# Map: AI Memory Skill

## Destination

An opencode skill (CLI via bash, Node + `node:sqlite`) that lets an agent store, retrieve, and search markdown memories in a per-project SQLite DB, with FTS5 text search, a typed directed graph between memories, JSON metadata, `memory://<id>` links, WAL concurrency, and migrate-on-open schema. The build fits one session; this map charts the slices.

## Notes

**Domain**: see `CONTEXT.md` for the glossary (memory, relation, kind, memory link, search, frontier) and `docs/adr/0001` for the graph-over-triple-store decision.

**Skills every session should consult**: `implement` or `implement-spec` for the build tickets; `domain-modeling` if terms shift; `tdd` if tests are wanted alongside.

**Standing preferences**:
- opencode-only for now; portability deferred.
- Library is the deep module; the skill is the thin agent-facing contract.
- `node:sqlite` (Node 22+ built-in), not better-sqlite3.
- Per-project store at `.ai-memory/memory.db` (gitignored).
- UUID v4 ids; `memory://<id>` link scheme.
- WAL mode + busy-retry for concurrency.
- Schema version table, migrate-on-open.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Scaffold and schema](issues/01-scaffold-and-schema.md): project scaffold + `Store.open()` with WAL, FK pragmas, busy-retry, v1 schema (memories/edges/schema_version/memories_fts + triggers), migrate-on-open; 5/5 smoke tests green.

- [Write operations](issues/02-write-operations.md): `store`/`update`/`delete`/`link` on `Store`; UUID v4 ids, idempotent edges (`INSERT OR IGNORE`), existence checks + clear errors, FTS/FK cascade via triggers; 25/25 tests green.

- [Read operations](issues/03-read-operations.md): `search`/`get`/`list`/`relations`/`stats` on `Store`; FTS5 `bm25` ranking, metadata `where` filters (raw SQL on JSON), `get` returns `null` for unknown id, `relations` throws; 51/51 tests green.

- [CLI entry and commands](issues/04-cli-entry.md): `bin/memory.js` (plain JS, executable) maps all 9 commands to `Store` methods; stdout JSON results, stderr errors, exit 1 on failure; `--db` override, `--metadata` JSON, `--where` raw SQL; 14/14 smoke tests + 6 error paths green; typecheck clean.

- [Skill authoring](issues/05-skill-authoring.md): `.agents/skills/ai-memory/SKILL.md` authored — when to use, one-line CLI examples (links to `--help` for full ref), `CONTEXT.md` for vocabulary, `memory://` link convention, frontier exploration loop; thin contract, no duplication.

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

_None yet._ The design tree is fully settled; the frontier is the build itself. If implementation surfaces a new decision (e.g. FTS5 tokenizer config, metadata index strategy, `memory://` link auto-materialization into edges), graduate it here into a ticket.

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->

- **MCP server / typed-tool transport.** CLI via bash is the v1 transport. MCP is a later, separate effort behind the same library.
- **Multi-tool portability (Claude Code, Cursor, etc.).** opencode-only for v1.
- **Vector / semantic search / embeddings.** Structured SQL + FTS5 only. Embeddings are a later layer if needed.
- **Dynamic DDL / agent-defined tables.** Fixed schema; agents impose structure via `metadata` JSON.
- **Triple-store / RDF model.** Ruled out by ADR-0001; see `docs/adr/0001-labeled-property-graph-over-triple-store.md`.
- **`unlink` CLI command.** Edge deletion is trivial to add later; v1 ships `link` only.
