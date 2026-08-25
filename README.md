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

Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure.

`--db <path>` overrides the store location (default: `.ai-memory/memory.db`).

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
