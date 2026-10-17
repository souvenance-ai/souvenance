# ai-memory

Persistent, searchable agent memory: markdown documents stored in a per-project SQLite database, connected by a typed directed graph.

## Requirements

- **Node.js 22+** (uses the built-in `node:sqlite` module)

## Quick start

```bash
# Store a memory
node bin/memory.js store "The user prefers tabs over spaces" --metadata '{"kind":"preference"}'

# Search for it later
node bin/memory.js search "tabs spaces"

# Link two memories with a typed relation
node bin/memory.js link <from-id> <to-id> --kind references

# See all commands
node bin/memory.js --help
```

The store lives at `.ai-memory/memory.db` (gitignored). One store per project.

## CLI commands

| Command | Description |
|---|---|
| `store <content> [--metadata <json>]` | Store a new memory, print its id |
| `supersede <old-id> --content <text> [--metadata <json>]` | Store a new version, mark old as superseded |
| `deprecate <id>` | Soft-delete a memory (mark as deprecated) |
| `merge <id1> <id2> [<id3> ...] --content <text> [--metadata <json>]` | Combine memories into one |
| `update <id> --metadata <json>` | Update a memory's metadata (content is immutable) |
| `delete <id> --force` | Delete a memory (destructive; prefer `deprecate`) |
| `link <from-id> <to-id> --kind <kind> [--metadata <json>]` | Create a typed edge |
| `search <query> [--where <sql>] [--limit N] [--all]` | FTS5 search, ranked results as JSON |
| `get <id>` | Print a memory as JSON |
| `list [--where <sql>] [--limit N] [--offset N] [--all]` | List memories by metadata filter |
| `relations <id> [--direction out\|in\|both]` | List edges to/from a memory |
| `stats` | Print store statistics as JSON |
| `tags [--where <sql>] [--all]` | List all distinct metadata tags with counts |
| `doctor [--fix]` | Validate store integrity (links, edges, kinds, weights, titles, FTS); exit 1 when findings |
| `export [--output <dir>]` | Export the entire store as a flat directory of markdown files |
| `serve [--port N] [--host <addr>] [--store <name>=<path>[:rw]]...` | Serve the store over HTTP as JSON (default `127.0.0.1:3141`); auxiliary stores mount at `/<name>/` |

Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure.

`--db <path>` overrides the store location (default: `.ai-memory/memory.db`).

## HTTP server

`memory serve` runs a long-lived process that consumes the **library** directly
(`~1.3ms` per operation) instead of paying the CLI's process-spawn cost
(~40–100ms per call). The root routes serve the process's own store — pick it
with `--db`:

```bash
node bin/memory.js --db .ai-memory/memory.db serve --port 3141
```

Routes mirror the CLI verbs 1:1 and return the same JSON shapes:

| Endpoint | Description |
|---|---|
| `GET /` | List every route |
| `POST /memories` | Store — body `{content, metadata?, weight?}` → `201 {id}` |
| `GET /memories` | List — `?where&limit&offset&min-weight&all` |
| `GET /memories/:id` | Get (bumps `access_count`) |
| `PATCH /memories/:id` | Update metadata/weight (content is immutable) |
| `DELETE /memories/:id?force=1` | Hard delete — guarded, prefer `deprecate` |
| `POST /memories/:id/supersede` | New version, old marked superseded |
| `POST /memories/:id/deprecate` | Soft-delete |
| `POST /memories/:id/link` | `{to, kind, metadata?}` — typed edge |
| `GET /memories/:id/relations` | `?direction=in\|out\|both&resolve=1` |
| `POST /merge` | `{ids, content, ...}` — combine memories |
| `GET /search?q=...` | FTS5 search, ranked results |
| `GET /stats` · `GET /tags` | Store statistics, tag counts |
| `GET /doctor` · `POST /doctor {fix:true}` | Integrity report, optional FTS rebuild |

Errors map to `404` (not found), `409` (wrong lifecycle state, guarded
delete, read-only store), `400` (validation, bad query/where), `503`
(database locked after retries). `--where` fragments pass through
unvalidated — same trust model as the CLI (local, single-user).

### Multi-store

One agent = one store: the root routes belong to the server's own store.
To *read* other stores (mirroring, evaluation), declare them at startup —
they mount the same verb routes under a name:

```bash
node bin/memory.js serve \
  --store alice=/path/to/alice/.ai-memory/memory.db \
  --store bench=/tmp/bench.db:rw   # :rw opts into writes (read-only by default)
```

- `GET /alice/search?q=...`, `GET /alice/stats`, `GET /alice/doctor` — read
  through; every write returns `409` (`POST /alice/doctor {fix:true}` counts
  as a write — the FTS rebuild mutates the index).
- Read-only by default is the **personality-isolation guarantee**: an agent
  cannot write into another store through its server. `:rw` is the explicit
  evaluator exception.
- Auxiliary stores open lazily on first request and their paths must already
  exist (the main `--db` is created on open; declared stores are not).
- `GET /` lists the declared stores with their modes. Names: lowercase
  letters, digits, hyphens; a name cannot shadow a root route (`search`,
  `memories`, `merge`, `stats`, `tags`, `doctor`).

## Development

```bash
yarn install
yarn typecheck    # tsc --noEmit
yarn test         # node --experimental-strip-types --test src/**/*.test.ts
```

## How it works

- **Store**: SQLite with WAL mode for concurrent access; writes retry on busy.
- **Search**: FTS5 full-text search with bm25 ranking, combinable with metadata filters via SQLite JSON1.
- **Graph**: Typed directed edges between memories (`from → to` with a `kind`); FK cascades delete edges when a memory is removed.
- **Schema**: Migrates on open — no manual migration step.
- **IDs**: UUID v4; `memory://<id>` link scheme for referencing memories in content.

See `CONTEXT.md` for the domain glossary and `docs/adr/0001` for the graph-over-triple-store decision.
