# souvenance

Persistent, searchable agent memory: markdown documents stored in a per-project SQLite database, connected by a typed directed graph. An agent's memory survives session restarts, mounts anywhere (CLI, HTTP, MCP), and evolves the way minds do — decisions are superseded, never overwritten; the graph is consolidated, never pruned.

## Install

```bash
npm install -g @souvenance/cli     # or zero-install: npx @souvenance/cli --help
souvenance --help
```

Requires **Node.js 24+** (uses the built-in `node:sqlite` module). Two bins ship, one entry file: `souvenance` is the product's name; `memory` is a transition alias from the project's `ai-memory` era — same file, same verbs, existing muscle memory keeps working.

## 60-second quickstart

```bash
# Store a memory
souvenance store "The user prefers tabs over spaces" --metadata '{"kind":"preference"}' --weight 0.9

# Search for it later
souvenance search "tabs spaces"

# Check the store's health
souvenance doctor
```

The store lives at `.souvenance/memory.db` (add `.souvenance/` to `.gitignore`). One store per project — the first command creates it. Memories are markdown with queryable JSON metadata, connected by typed relations (`souvenance link <from-id> <to-id> --kind references`); search is SQLite FTS5 ranked by bm25 × weight × recency. This quickstart is proven from a cold `npx` — no clone, no build, a scratch directory.

## The three surfaces

Every surface speaks the same verbs and returns the same JSON shapes — one library underneath:

| Surface | Command | For |
|---|---|---|
| **CLI** | `souvenance <verb>` | A single agent on its own machine — daily store, search, link, finish |
| **HTTP** | `souvenance serve` | Long-lived, cross-machine consumption — token grants, `GET /recover`, multi-store mounts |
| **MCP** | `souvenance mcp` | Any MCP client: the memory as first-class typed tools, no skill needed |

## Agents: load the skill

The daily practice — the recovery ritual at session start (directives, summaries, open objectives), decisions stored the moment they happen, the closing `finish` ritual, threshold-triggered dreaming — lives in two skills, [`souvenance`](.agents/skills/souvenance/SKILL.md) (daily use) and [`souvenance-setup`](.agents/skills/souvenance-setup/SKILL.md) (first-time setup for a new project). Mount once, and every session compounds.

## CLI commands

Invoke as `souvenance <command>` (npm-installed) or `node bin/souvenance.js <command>` (repo checkout). Reference:

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
| `doctor [--fix]` | Validate store integrity (links, edges, kinds, weights, titles, handoff, FTS); exit 1 when findings |
| `finish` | Closing ritual in one call: the doctor as a hard gate plus the session obligations it cannot see (summary in the window, experience note, dream debt); exit 1 when blocking findings |
| `export [--output <dir>]` | Export the entire store as a flat directory of markdown files |
| `fork <path> [--force]` | Copy the store to a new store file (VACUUM INTO) — an exact copy, nothing added |
| `serve [--port N] [--host <addr>] [--store <name>=<path>[:rw]]...` | Serve the store over HTTP as JSON (default `127.0.0.1:3141`); auxiliary stores mount at `/<name>/` |

Output: JSON on stdout, `error: <msg>` on stderr, exit 0 on success / 1 on failure. `store`, `supersede`, and `merge` print the bare id; `update`, `delete`, `link`, and `deprecate` print a one-word confirmation; `fork` prints `{path, memories, edges}`.

`--db <path>` overrides the store location (default: `.souvenance/memory.db`).

### Fork — copies, not backups

`souvenance fork <path>` copies the store to a new store file: an exact `VACUUM INTO` snapshot — safe under concurrent writers, compacted, FTS index included, and nothing added. From birth the two stores are individuals: they never re-sync and never cross-write. Restoring an old fork is a rebirth, never a resync (see `docs/adr/0002-fork-never-sync.md`).

A fork that should know its origin gets told by its forker, in the forker's own words: `souvenance --db <fork> store "..."` after the copy — the tool does not presume the narrative (archive, gift, sandbox, product seed). `fork` deliberately does no scheduling and no transport: keeping copies off-disk and fresh is the installer's backup software's job. An existing target is refused without `--force` — a fork never clobbers an individual silently.

### Finish — the closing ritual

`souvenance finish` is the closing counterpart of `GET /recover`: one call that bundles every obligation an ending session owes. It runs `doctor` first as a hard gate — never finish, dream or recommend a relaunch over a sick store — then checks what the doctor is deliberately blind to, because it validates the store, not the session:

- **summary in the window** — memories stored in the last 24h with no summary: the register is not self-sufficient for a fresh session (block);
- **experience note** — the standing evaluation is owed per session that stored memories (block);
- **dream debt** — made mechanical: the `+10` volume line since the last dream blocks; the session-end clause surfaces as a visible **warn** instead of the agent's silent judgment call (warns are reported, never blocking — judgment debts are paid or argued aloud, never silent).

Read-only, diagnosis-not-error exit semantics like `doctor`: exit 1 when blocking findings exist. Doctor and finish both exist — doctor stays standalone (mid-session, `--fix`); finish composes it, never replaces it, the same way `/recover` bundles the opening ritual without replacing `list`/`get`. A clear/relaunch recommendation is valid only once `finish` reports healthy.

## HTTP server

`souvenance serve` runs a long-lived process that consumes the **library** directly
(`~1.3ms` per operation) instead of paying the CLI's process-spawn cost
(~40–100ms per call). The root routes serve the process's own store — pick it
with `--db`:

```bash
node bin/souvenance.js --db .souvenance/memory.db serve --port 3141
```

Routes mirror the CLI verbs 1:1 and return the same JSON shapes:

| Endpoint | Description |
|---|---|
| `GET /` | List every route |
| `GET /recover` | Recovery ritual in one call: `{directives, summaries, objectives, stats}` — active `kind: directive` (20) + latest `kind: summary` (3) + open `kind: objective` (10), `?directives&summaries&objectives` limits |
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
node bin/souvenance.js serve \
  --store alice=/path/to/alice/.souvenance/memory.db \
  --store bench=/tmp/bench.db:rw   # :rw opts into writes (read-only by default)
```

- `GET /alice/search?q=...`, `GET /alice/stats`, `GET /alice/doctor` — read
  through; every write returns `409` (`POST /alice/doctor {fix:true}` counts
  as a write — the FTS rebuild mutates the index).
- `GET /alice/recover` runs the identity ritual on an auxiliary store — the
  one verb a read-only-mounted agent needs: with no CLI access to that store,
  /recover is how a fresh agent reorients through HTTP alone.
- Read-only by default is the **personality-isolation guarantee**: an agent
  cannot write into another store through its server. In local mode the
  isolation is two-layered — the `409` middleware is the HTTP face with the
  hint, and the auxiliary store itself opens **read-only at the library
  level** (nothing can write it, route layer included). In token mode mounts
  open writable and per-token grants govern. `:rw` is the explicit evaluator
  exception.
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
node bin/souvenance.js serve \
  --token valentin=souv-$(openssl rand -hex 32) \
  --token ci=souv-$(openssl rand -hex 32)@notes \
  --token writer=souv-$(openssl rand -hex 32)@root:rw:where
```

- Token mode (`--token` declared): every request needs
  `Authorization: Bearer <secret>` — `401` otherwise. One token binds ONE
  store: `root` names the process store, otherwise an auxiliary store name
  (`403` elsewhere). Reads are always allowed; writes need the token's
  `:rw` opt-in (`409`).
- Spec: `<agent>=souv-token[@<store>][:rw][:where]` — tokens are structured
  (`souv-` + 32-64 lowercase hex chars = 128-256 bits of entropy, enforced
  by parsing; generate with `echo souv-$(openssl rand -hex 16)`) and
  compared timing-safe. The prefix makes a leaked token recognizable by
  scanner regex. `:where` opts the token into raw `where` fragments;
  without it the structured `?kind=&tag=` filters (compiled server-side
  into the same JSON1) are the remote-safe query path.
- In token mode, store-level `:rw` mounts are rejected at startup — write
  access is decided per token, not per mount. `GET /` lists only the
  presenting token's grant, without db paths.
- **Token file** — secrets in `argv` are world-readable (`ps aux`,
  `/proc/<pid>/cmdline`): `--token-file <path>` (repeatable, composes with
  `--token`) reads an env-style file instead:

  ```bash
  # /etc/souvenance/tokens.env  — chmod 600
  # one grant per line: MEMORY_TOKEN_<agent>=<secret>[@<store>][:rw][:where]
  MEMORY_TOKEN_valentin=6c4b...            # process store, read-only
  export MEMORY_TOKEN_ci=9f1e...@notes     # 'export' accepted, comments too
  MEMORY_TOKEN_writer="aa07...@root:rw:where"
  ```

  The key carries the agent (hyphens written as underscores — injective,
  agent names never contain underscores, so the file stays a valid dotenv
  file an operator can export); the value reuses the exact `--token`
  grammar after `<agent>=`. Blank lines and full-line `#` comments are
  skipped, an optional `export ` prefix is accepted, one pair of
  surrounding quotes is stripped — no interpolation, no escapes.
  Parsing is strict (refuse, don't hide): unknown keys, duplicate agents or
  an entry-free file refuse to start with a line-numbered error — a typo'd
  key must never look like *no tokens granted*. On POSIX the file must be
  owner-only (`chmod 600`): bearer secrets in a group/world-readable file
  void the boundary, the same refusal class as an exposed unauthenticated
  bind.

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
souvenance server listening on http://0.0.0.0:3141 ...
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

### MCP — the typed-tool surface

`souvenance mcp` speaks **MCP over stdio** (JSON-RPC 2.0, newline-delimited):
the same library behind a typed-tool surface any MCP client can mount —
an agent gets the memory as first-class tools, no markdown skill needed.

```sh
# OpenCode (CLI installed via npm):
opencode mcp add souvenance -- souvenance mcp

# OpenCode (repo checkout):
opencode mcp add souvenance -- node /path/to/souvenance/bin/souvenance.js mcp
```

```jsonc
{
  "mcp": {
    "servers": {
      "souvenance": {
        "type": "local",
        "command": ["node", "/path/to/souvenance/bin/souvenance.js", "mcp"],
      },
    },
  },
}
```

- Tools mirror the CLI verbs 1:1 and return the same JSON shapes as CLI
  stdout: `recover` (the ritual — directives + summaries + objectives +
  stats, run it FIRST), `store`, `supersede`, `merge`, `update`, `link`,
  `deprecate`,
  `delete` (requires `force: true`), `get`, `search`, `list`, `relations`,
  `tags`, `stats`, `doctor`.
- Server instructions carry the recovery ritual (recover first, content
  immutable, weight = importance 0–1) — they enter the client's system
  prompt at initialize, so an agent is oriented without loading the skill.
- The tool layer validates what the lib trusts: weight 0–1, integer
  limits refused below 0, metadata as a JSON object; tool failures come
  back as `isError` results, never as protocol errors.
- Protocol: `initialize` echoes the client's requested revision when it is
  one the server speaks (`2024-11-05` → `2025-11-25`), otherwise answers
  `2025-06-18`.
- Trust zone: stdio is the agent's own process — the loopback equivalent,
  no bearer tokens, raw `where` fragments stay available. The server
  opened is the one at `--db` (default `.souvenance/memory.db`); mounting
  ANOTHER store is a `--db` flag away, cross-machine consumption stays
  with `serve`.

## Development

```bash
yarn install       # yarn 4; Node.js 24+ required
yarn typecheck    # tsc --noEmit
yarn test         # node --experimental-strip-types --test src/**/*.test.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout, the domain conventions and how to file bugs.

## How it works

- **Store**: SQLite with WAL mode for concurrent access; writes retry on busy.
- **Read-only stores**: `Store.open({readOnly: true})` opens an existing store
  for reading only — a missing file is refused (nothing is created), an
  out-of-date schema is refused (open it read-write once to migrate), every
  write verb throws, and reads leave `access_count` untouched.
- **Search**: FTS5 full-text search with bm25 ranking, combinable with metadata filters via SQLite JSON1.
- **Graph**: Typed directed edges between memories (`from → to` with a `kind`); FK cascades delete edges when a memory is removed.
- **Schema**: Migrates on open — no manual migration step.
- **IDs**: UUID v4; `memory://<id>` link scheme for referencing memories in content.

See `CONTEXT.md` for the domain glossary and `docs/adr/0001` for the graph-over-triple-store decision.
