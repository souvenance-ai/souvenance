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

Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store`, `supersede`, and `merge` print the bare id; `update`, `delete`, `link`, and `deprecate` print a one-word confirmation.

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
| `GET /recover` | Recovery ritual in one call: `{directives, summaries, stats}` — active `kind: directive` (20) + latest `kind: summary` (3), `?directives&summaries` limits |
| `POST /memories` | Store — body `{content, metadata?, weight?}` → `201 {id}` |
| `GET /memories` | List — `?where` (local) or `?kind&tag` (structured), `&limit&offset&min-weight&all` |
| `GET /memories/:id` | Get (bumps `access_count`) |
| `PATCH /memories/:id` | Update metadata/weight (content is immutable) |
| `DELETE /memories/:id?force=1` | Hard delete — guarded, prefer `deprecate` |
| `POST /memories/:id/supersede` | New version, old marked superseded |
| `POST /memories/:id/deprecate` | Soft-delete |
| `POST /memories/:id/link` | `{to, kind, metadata?}` — typed edge |
| `GET /memories/:id/relations` | `?direction=in\|out\|both&resolve=1` |
| `POST /merge` | `{ids, content, ...}` — combine memories |
| `GET /search?q=...` | FTS5 search, ranked results — `&where` (local) or `&kind&tag` (structured), `&limit&all` |
| `GET /stats` · `GET /tags` | Store statistics, tag counts (`/tags` also takes `?where|kind&tag&all`) |
| `GET /doctor` · `POST /doctor {fix:true}` | Integrity report, optional FTS rebuild |

Errors map to `404` (not found), `409` (wrong lifecycle state, guarded
delete, read-only store), `400` (validation, bad query/where), `413`
(body over the 1 MiB cap), `503` (database locked after retries).
`--where` fragments pass through unvalidated — same trust model as the
CLI (local, single-user).

Errors map to `401` (unknown/missing token), `403` (store not granted to
the token), `404` (not found), `409` (wrong lifecycle state, guarded
delete, read-only store or token), `400` (validation, bad query/where,
raw `where` without the per-token opt-in), `413` (body over the 1 MiB
cap), `503` (database locked after retries). `--where` fragments pass
through unvalidated — the CLI trust model is local, single-user; over
HTTP the fragment is **local-only** (remote requests use the structured
filters or an explicit opt-in, see Tokens below).

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
- `GET /alice/recover` runs the identity ritual on an auxiliary store — the
  one verb a read-only-mounted agent needs: with no CLI access to that store,
  /recover is how a fresh agent reorients through HTTP alone.
- Read-only by default is the **personality-isolation guarantee**: an agent
  cannot write into another store through its server. `:rw` is the explicit
  evaluator exception.
- Auxiliary stores open lazily on first request and their paths must already
  exist (the main `--db` is created on open; declared stores are not).
- `GET /` lists the declared stores with their modes. Names: lowercase
  letters, digits, hyphens; a name cannot shadow a root route (`recover`,
  `search`, `memories`, `merge`, `stats`, `tags`, `doctor`) and cannot be
  `root` (that name belongs to token grants — see below).

### Tokens — the trust boundary

The memory is intimate (directives, decisions, conversations). Exposing it
beyond loopback is a trust decision the server enforces mechanically:
binding a **non-loopback** host (anything but `127.0.0.1`, `::1`,
`localhost`) **without token grants refuses to start**.

```bash
node bin/memory.js serve \
  --token valentin=$(openssl rand -hex 32) \
  --token ci=$(openssl rand -hex 32)@notes \
  --token writer=$(openssl rand -hex 32)@root:rw:where
```

- Token mode (`--token` declared): every request needs
  `Authorization: Bearer <secret>` — `401` otherwise. One token binds ONE
  store: `root` names the process store, otherwise an auxiliary store name
  (`403` elsewhere). Reads are always allowed; writes need the token's
  `:rw` opt-in (`409`).
- Spec: `<agent>=<secret>[@<store>][:rw][:where]` — secrets are 16+ chars
  of `[A-Za-z0-9_-]` (64 with `openssl rand -hex 32`), compared
  timing-safe. `:where` opts the token into raw `where` fragments;
  without it the structured `?kind=&tag=` filters (compiled server-side
  into the same JSON1) are the remote-safe query path.
- In token mode, store-level `:rw` mounts are rejected at startup — write
  access is decided per token, not per mount. `GET /` lists only the
  presenting token's grant, without db paths.

### Exposure — TLS and request caps

The server is **plain HTTP by design** — the TLS decision of step 3 of the
internet-facing path: TLS is terminated at a reverse proxy or inherited
from a private overlay, never built in.

- **Reverse proxy** (public endpoint): put Caddy or nginx in front; the
  proxy owns certificates, renewal and SANs, the server keeps one
  plain-HTTP socket. The bearer boundary travels end-to-end — the secret
  lives only in the `Authorization` header, which the proxy forwards
  untouched:

  ```bash
  caddy reverse-proxy --from memory.example.com --to 127.0.0.1:3141
  ```

- **Private overlay** (Tailscale, WireGuard): transport security is
  inherited from the tunnel; point `--host` at the overlay address and
  the token grant stays the only gate.
- Built-in TLS is deliberately absent: certificate lifecycle is exactly
  what proxies automate, and a half-configured TLS server (stale cert,
  missing SAN) is worse than an honest plain-HTTP server behind a proxy.

Ergonomics: a non-loopback `--host` prints the reachable addresses at
startup — the exact URLs to hand a remote agent — plus the
plaintext-HTTP reminder:

```
memory server listening on http://0.0.0.0:3141 ...
  exposed: http://192.168.1.42:3141
  note: plaintext HTTP — terminate TLS at a reverse proxy (Caddy/nginx) or use a private overlay (Tailscale/WireGuard); the bearer boundary travels end-to-end
```

Request caps (every mode):

- Request bodies over **1 MiB** → `413`, enforced twice: on the declared
  `Content-Length` up front, and again on the streamed body — a lying or
  chunked request without content-length cannot slide past.
- `?limit=` over **1000** → `400` (list, search, recover). `limit` and
  `offset` must be non-negative integers — a negative `LIMIT` *disables*
  the SQL limit in SQLite, so it is refused, not clamped. Pagination
  walks `limit`+`offset`; bulk export stays a CLI verb.
- Listener timeouts: request 30s, headers 10s, keep-alive 5s.
- No rate limits, deliberately: 64-hex bearer secrets are not
  brute-forceable, auth is per-request rather than per-connection, and
  per-IP state would add a DoS surface to a stateless server.

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
