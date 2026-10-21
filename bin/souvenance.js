#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../src/db.ts";
import { slugify, filenameFor, renderMemory } from "../src/export.ts";

const HELP = `Usage: souvenance <command> [args] [flags]

Commands:
  store <content> [--metadata <json>] [--weight <0-1>]  Store a new memory, print its id
  supersede <old-id> --content <text> [--metadata <json>] [--weight <0-1>]
      Store a new version, mark old as superseded
  deprecate <id>                               Soft-delete a memory (mark as deprecated)
  merge <id1> <id2> [<id3> ...] --content <text> [--metadata <json>] [--weight <0-1>]  Combine memories into one
  update <id> [--metadata <json>] [--weight <0-1>]  Update a memory's metadata and/or weight (content is immutable)
  delete <id> --force                           Delete a memory (destructive; prefer 'deprecate')
  link <from-id> <to-id> --kind <kind> [--metadata <json>]  Create a typed edge
  search <query> [--where <sql>] [--limit N] [--all]  FTS5 search, ranked by bm25 × weight × recency × access_boost
  get <id>                                    Print a memory as JSON (or "not found"); increments access_count
  list [--where <sql>] [--limit N] [--offset N] [--all] [--min-weight <0-1>]  List memories by metadata filter
  relations <id> [--direction out|in|both] [--resolved]
      List edges to/from a memory (--resolved annotates superseded/merged
      targets with resolved_to, their current version)
  stats                                       Print store statistics as JSON
  tags [--where <sql>] [--all]               List all distinct tags with counts, as JSON
  export [--output <dir>]                     Export the entire store as a flat directory of markdown files
  fork <path> [--force]                       Copy the store to a new store file (VACUUM INTO) — an exact
      copy, nothing added. No scheduling, no transport: protecting the files
      is the installer's backup software's job; this is the copy primitive
      of the fork model only
  doctor [--fix]                              Validate store integrity (links, edges, kinds, weights,
      titles, FTS index); prints a JSON report, exit 1 when findings
  finish                                      Closing ritual in one call: the doctor as a hard gate plus
      the session obligations it cannot see (summary in the window,
      experience note, dream debt — volume line blocks, session-end
      clause warns); exit 1 when blocking findings — a clear/relaunch
      recommendation is valid only once finish reports healthy
  mcp                                         Serve the store as an MCP stdio server (JSON-RPC 2.0 on
      stdin/stdout; tools mirror the CLI verbs 1:1)
  serve [--port N] [--host <addr>] [--store <name>=<path>[:rw]]...
      [--token <agent>=<secret>[@<store>][:rw][:where]]...
      [--token-file <path>]...
      Serve the store over HTTP as JSON (default 127.0.0.1:3141);
      root routes serve the process store (--db); each --store mounts
      an auxiliary store at /<name>/ (read-only unless :rw). Declaring
      --token grants switches to token mode: every request must present
      its bearer token, scoped to its granted store

Flags:
  --db <path>      Override the DB path (default: .ai-memory/memory.db)
  --output <dir>   Export output directory (default: .ai-memory/export/)
  --help, -h       Show this help

Output:
  stdout: JSON results (one document per command)
  stderr: error messages
  exit:   0 on success, 1 on error

Notes:
  --metadata accepts a JSON string: '{"tags":["a"],"kind":"note"}'
  --where accepts a raw SQL fragment on the metadata JSON column using SQLite
    JSON operators, e.g.: metadata->>'$.kind' = 'note'
  --all includes superseded/deprecated/merged memories in search/list/tags results
  --resolved on relations annotates superseded/merged targets with resolved_to
    (the terminal successor via the supersedes/merges bridges); raw rows unchanged
  supersede/merge without --metadata inherit kind and tags from the source
    memory(ies); explicit --metadata is used verbatim
  export writes one .md file per memory (all statuses) with YAML frontmatter;
    memory:// links are rewritten to relative file links; idempotent
  fork copies the store to a new store file — a consistent VACUUM INTO
    snapshot (safe under concurrent writers, compacted) and NOTHING is
    added to the copy: a fork that should know its origin gets told by its
    forker, in the forker's own words (souvenance --db <fork> store "...").
    Forks never re-sync and never cross-write; restoring a dormant fork is
    rebirth, never resync. Refuses an existing target without --force (a
    fork never clobbers an individual silently). Prints a JSON object:
    {path, memories, edges}
  mcp serves the store as an MCP stdio server: JSON-RPC 2.0 on stdin/stdout
    (initialize — protocolVersion echoed when known, else 2025-06-18 —,
    tools/list, tools/call, ping; notifications ignored). Tools mirror the
    CLI verbs 1:1 and return the same JSON shapes as CLI stdout; server
    instructions carry the recovery ritual. No tokens: stdio is the agent's
    own process (the loopback trust zone) — cross-machine consumption stays
    with 'serve'. Mount in OpenCode: 'opencode mcp add souvenance -- node
    <path>/bin/souvenance.js mcp' (project or --global); the store opened is the
    one at --db (default .ai-memory/memory.db)
  doctor diagnoses, it never edits content. --fix rebuilds the FTS index
    (the one mechanical repair); every other finding is repaired by hand
    (supersede, merge, update, link). Exit code is 1 when findings exist
    (a successful diagnosis, not an error — stderr stays empty)
  finish is the closing ritual, composed: it RUNS doctor as a hard gate
    (never finish, dream or recommend a relaunch over a sick store), then
    checks the session obligations the doctor is blind to — a summary and
    an experience note within the 24h window when memories were stored,
    and the dream debt made mechanical: the +10 volume line blocks, the
    session-end clause surfaces as a warn instead of the agent's silent
    judgment call. Read-only; warns are reported, never blocking (judgment
    debts are paid or argued aloud, never silent). Exit 1 when blocking
    findings exist — the same diagnosis-not-error semantics as doctor.
    Precedent: /recover bundles the opening ritual; finish bundles the
    closing one. Doctor and finish both exist: doctor stays standalone
    (mid-session, --fix); finish composes it, never replaces it
  serve keeps the root routes on the process store (--db): one agent =
    one store. Each --store <name>=<path> mounts another store at
    /<name>/... — read-only by default (personality isolation: an agent
    cannot write into another store through its server); add :rw to opt
    in (the evaluator exception). Declared paths must already exist
    (the main --db is created on open, declared stores are not).
    Store names: lowercase letters, digits, hyphens, starting with a
    letter; reserved by root routes: recover, search, memories, merge,
    stats, tags, doctor (and 'root', which names the process store in
    token grants). Auxiliary stores open lazily on first request.
    Trust boundary (the identity follows the agent, safely): binding a
    non-loopback host (anything but 127.0.0.1, ::1, localhost) without
    --token grants refuses to start. Token mode (--token declared):
    every request needs Authorization: Bearer <secret> (401 otherwise);
    one token binds ONE store — 'root' for the process store, else an
    auxiliary name (403 elsewhere); reads are always allowed, writes
    need the token's :rw opt-in (409); raw --where fragments are
    local-only — remote requests use the structured kind/tag params or
    opt in per token with :where (400). Token specs:
    <agent>=<secret>[@<store>][:rw][:where], secrets 16+ chars of
    [A-Za-z0-9_-] (generate: openssl rand -hex 32), compared timing-safe.
    Token files: --token-file <path> (repeatable, composes with --token)
    reads an env-style file, one grant per line as
    MEMORY_TOKEN_<agent>=<secret>[@<store>][:rw][:where] — the agent lives
    in the key, hyphens written as underscores (dotenv-compatible; full-line
    # comments, optional 'export ' prefix, one pair of quotes stripped).
    Strict: unknown keys, duplicate agents or an entry-free file refuse to
    start (a typo must never look like 'no tokens granted'); POSIX perms
    must be owner-only (chmod 600 — shared-readable secrets void the
    boundary).
    Structured filters (all modes): GET /memories, /search and /tags
    accept ?kind=<k> and ?tag=<t> (repeatable, AND-composed) compiled
    server-side into the same JSON1 the --where fragment would express;
    pass either 'where' or kind/tag, not both.
    GET /recover returns the recovery ritual in one call — directives
    (kind: directive, latest 20) + summaries (latest 3) + stats; the
    ritual output for agents whose only store access is the HTTP surface.
    DELETE /memories/:id is destructive and requires ?force=1 — prefer
    POST /memories/:id/deprecate. Errors map to 401 (unknown token),
    403 (store not granted), 404 (not found), 409 (wrong lifecycle
    state / guarded delete / read-only), 400 (validation, bad query,
    raw where without opt-in), 413 (body over the 1 MiB cap),
    503 (database locked after retries)
    Transport (step 3): the server is plain HTTP by design — TLS
    terminates at a reverse proxy (Caddy/nginx) or rides a private
    overlay (Tailscale/WireGuard); the bearer boundary travels
    end-to-end (the secret lives only in the Authorization header).
    A non-loopback bind prints the reachable addresses at startup.
    Request caps: bodies over 1 MiB get 413; ?limit over 1000 gets 400
    (paginate with offset; bulk export stays a CLI verb); limit/offset
    must be non-negative integers (a negative LIMIT disables the SQL
    limit). Timeouts: request 30s, headers 10s, keep-alive 5s. No rate
    limits: 64-hex bearer secrets are not brute-forceable and auth is
    per-request, not per-connection.
`;

const BOOLEAN_FLAGS = new Set(["--all", "--force", "--resolved", "--fix"]);

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      flags.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a;
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }
      const val = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[i + 1];
      if (!a.includes("=")) i++;
      // --store, --token and --token-file are repeatable: one flag per
      // auxiliary store / inline grant / token file
      if (key === "--store" || key === "--token" || key === "--token-file") {
        if (!Array.isArray(flags[key])) flags[key] = [];
        flags[key].push(val);
      } else {
        flags[key] = val;
      }
      continue;
    }
    args.push(a);
  }
  return { args, flags };
}

function parseMetadata(jsonStr) {
  if (!jsonStr) return undefined;
  try {
    return JSON.parse(jsonStr);
  } catch {
    fail(`invalid metadata JSON: ${jsonStr}`);
  }
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function print(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function num(flag) {
  if (flag === undefined) return undefined;
  const n = Number(flag);
  if (!Number.isFinite(n)) fail(`expected a number, got: ${flag}`);
  return n;
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || args.length === 0) {
    process.stdout.write(HELP);
    return;
  }

  const command = args[0];
  const rest = args.slice(1);
  // Commands that end healthy-but-with-findings mark this; exit(1) fires
  // AFTER the finally block so the store closes normally.
  let exitCode = 0;

  const dbPath = flags["--db"];
  let store;
  try {
    store = Store.open(dbPath ? { dbPath } : {});
  } catch (err) {
    fail(`could not open store: ${err instanceof Error ? err.message : err}`);
  }
  // Auxiliary stores declared for 'serve', opened lazily on first request;
  // closed after shutdown alongside the main store.
  const auxiliaries = [];

  try {
    switch (command) {
      case "store": {
        if (rest.length < 1) fail("store requires <content>");
        const content = rest[0];
        const metadata = parseMetadata(flags["--metadata"]);
        const weight = num(flags["--weight"]);
        const opts = {};
        if (metadata) opts.metadata = metadata;
        if (weight !== undefined) opts.weight = weight;
        const id = store.store(content, opts);
        process.stdout.write(id + "\n");
        break;
      }
      case "supersede": {
        if (rest.length < 1) fail("supersede requires <old-id>");
        const oldId = rest[0];
        const content = flags["--content"];
        if (!content) fail("supersede requires --content <text>");
        const metadata = parseMetadata(flags["--metadata"]);
        const weight = num(flags["--weight"]);
        const opts = {};
        if (metadata) opts.metadata = metadata;
        if (weight !== undefined) opts.weight = weight;
        const id = store.supersede(oldId, content, opts);
        process.stdout.write(id + "\n");
        break;
      }
      case "deprecate": {
        if (rest.length < 1) fail("deprecate requires <id>");
        store.deprecate(rest[0]);
        process.stdout.write("deprecated\n");
        break;
      }
      case "merge": {
        if (rest.length < 2) fail("merge requires at least 2 ids");
        const content = flags["--content"];
        if (!content) fail("merge requires --content <text>");
        const metadata = parseMetadata(flags["--metadata"]);
        const weight = num(flags["--weight"]);
        const opts = {};
        if (metadata) opts.metadata = metadata;
        if (weight !== undefined) opts.weight = weight;
        const id = store.merge(rest, content, opts);
        process.stdout.write(id + "\n");
        break;
      }
      case "update": {
        if (rest.length < 1) fail("update requires <id>");
        const id = rest[0];
        const metadata = parseMetadata(flags["--metadata"]);
        const weight = num(flags["--weight"]);
        if (metadata === undefined && weight === undefined) {
          fail("update requires at least one of --metadata or --weight (content is immutable; use 'supersede' to revise)");
        }
        const opts = {};
        if (metadata !== undefined) opts.metadata = metadata;
        if (weight !== undefined) opts.weight = weight;
        store.update(id, opts);
        process.stdout.write("updated\n");
        break;
      }
      case "delete": {
        if (rest.length < 1) fail("delete requires <id>");
        if (!flags["--force"]) {
          fail("delete is destructive; use 'deprecate' instead, or pass --force to proceed");
        }
        store.delete(rest[0]);
        process.stdout.write("deleted\n");
        break;
      }
      case "link": {
        if (rest.length < 2) fail("link requires <from-id> <to-id>");
        const [fromId, toId] = rest;
        const kind = flags["--kind"];
        if (!kind) fail("link requires --kind <kind>");
        const metadata = parseMetadata(flags["--metadata"]);
        store.link(fromId, toId, kind, metadata ? { metadata } : {});
        process.stdout.write("linked\n");
        break;
      }
      case "search": {
        if (rest.length < 1) fail("search requires <query>");
        const query = rest.join(" ");
        const results = store.search(query, {
          ...(flags["--where"] ? { where: flags["--where"] } : {}),
          ...(flags["--limit"] ? { limit: num(flags["--limit"]) } : {}),
          ...(flags["--all"] ? { includeLegacy: true } : {}),
        });
        print(results);
        break;
      }
      case "get": {
        if (rest.length < 1) fail("get requires <id>");
        const mem = store.get(rest[0]);
        if (mem) {
          print(mem);
        } else {
          process.stderr.write(`not found: ${rest[0]}\n`);
          process.exitCode = 1;
        }
        break;
      }
      case "list": {
        const results = store.list({
          ...(flags["--where"] ? { where: flags["--where"] } : {}),
          ...(flags["--limit"] ? { limit: num(flags["--limit"]) } : {}),
          ...(flags["--offset"] ? { offset: num(flags["--offset"]) } : {}),
          ...(flags["--all"] ? { includeLegacy: true } : {}),
          ...(flags["--min-weight"] ? { minWeight: num(flags["--min-weight"]) } : {}),
        });
        print(results);
        break;
      }
      case "relations": {
        if (rest.length < 1) fail("relations requires <id>");
        const direction = flags["--direction"];
        const results = store.relations(rest[0], {
          ...(direction ? { direction } : {}),
          ...(flags["--resolved"] ? { resolve: true } : {}),
        });
        print(results);
        break;
      }
      case "stats": {
        print(store.stats());
        break;
      }
      case "tags": {
        const results = store.tags({
          ...(flags["--where"] ? { where: flags["--where"] } : {}),
          ...(flags["--all"] ? { includeLegacy: true } : {}),
        });
        print(results);
        break;
      }
      case "export": {
        const outputDir = flags["--output"] ?? ".ai-memory/export";
        mkdirSync(outputDir, { recursive: true });
        const { memories, edges } = store.dump();

        const edgesByMemory = new Map();
        for (const edge of edges) {
          if (!edgesByMemory.has(edge.from_id)) edgesByMemory.set(edge.from_id, []);
          if (!edgesByMemory.has(edge.to_id)) edgesByMemory.set(edge.to_id, []);
          edgesByMemory.get(edge.from_id).push(edge);
          edgesByMemory.get(edge.to_id).push(edge);
        }

        const idToFilename = new Map();
        const memArray = [...memories];
        for (const mem of memArray) {
          idToFilename.set(mem.id, filenameFor(mem));
        }

        let count = 0;
        for (const mem of memArray) {
          const rels = edgesByMemory.get(mem.id) ?? [];
          const markdown = renderMemory(mem, rels, idToFilename);
          writeFileSync(join(outputDir, idToFilename.get(mem.id)), markdown);
          count++;
        }
        process.stdout.write(`exported ${count} memories to ${outputDir}\n`);
        break;
      }
      case "fork": {
        if (rest.length < 1) fail("fork requires <target-path>");
        const result = store.fork(rest[0], flags["--force"] ? { force: true } : {});
        print(result);
        break;
      }
      case "doctor": {
        const report = store.doctor({
          ...(flags["--fix"] ? { fix: true } : {}),
        });
        print(report);
        if (!report.healthy) exitCode = 1;
        break;
      }
      case "finish": {
        const report = store.finish();
        print(report);
        if (!report.healthy) exitCode = 1;
        break;
      }
      case "mcp": {
        // Long-running like serve: the store was opened above and is closed
        // by the finally block after stdin ends (the client disconnecting).
        const { runMcpServer } = await import("../src/mcp.ts");
        await runMcpServer(store);
        break;
      }
      case "serve": {
        // Long-running: the store was opened above and is closed by the
        // finally block only after the server shuts down (SIGINT/SIGTERM).
        const {
          createApp, parseStoreSpec, parseTokenSpec, parseTokenFile, DEFAULT_HOST, DEFAULT_PORT,
          exposedAddresses, isLoopbackHost,
          REQUEST_TIMEOUT_MS, HEADERS_TIMEOUT_MS, KEEPALIVE_TIMEOUT_MS,
        } = await import("../src/server.ts");
        const { serve } = await import("@hono/node-server");
        const port = num(flags["--port"]) ?? DEFAULT_PORT;
        const host = flags["--host"] ?? DEFAULT_HOST;
        // Declared auxiliary stores: mounted at /<name>/, read-only unless :rw.
        // Paths must already exist — Store.open would silently create an
        // empty store on a typo'd path at first request.
        const declared = (flags["--store"] ?? []).map(parseStoreSpec);
        for (const d of declared) {
          if (!existsSync(d.dbPath)) {
            fail(`store '${d.name}' not found: ${d.dbPath} (declared stores must already exist; the main --db is created on open)`);
          }
        }
        // Bearer-token grants (increment 4): one token = one agent bound to
        // one store, read-only by default; declaring any token switches the
        // server to token mode and createApp enforces the trust boundary.
        // Token files (decision 4429801d) feed the same list — secrets out
        // of argv (ps aux / /proc/<pid>/cmdline are world-readable).
        const tokens = [
          ...(flags["--token-file"] ?? []).flatMap(parseTokenFile),
          ...(flags["--token"] ?? []).map(parseTokenSpec),
        ];
        const openStore = (dbPath) => {
          const s = Store.open({ dbPath });
          auxiliaries.push(s);
          return s;
        };
        const server = serve({
          fetch: createApp(store, { stores: declared, openStore, tokens, host }).fetch,
          port,
          hostname: host,
          // Step-3 caps (95556ca0): explicit bounds on the long-lived
          // listener — a request is received fully within 30s, headers
          // within 10s, idle keep-alive sockets released after 5s.
          serverOptions: {
            requestTimeout: REQUEST_TIMEOUT_MS,
            headersTimeout: HEADERS_TIMEOUT_MS,
            keepAliveTimeout: KEEPALIVE_TIMEOUT_MS,
          },
        });
        const storesNote =
          declared.length > 0
            ? `; stores: ${declared.map((d) => `${d.name}=${d.dbPath} (${d.mode})`).join(", ")}`
            : "";
        const tokensNote =
          tokens.length > 0
            ? `; tokens: ${tokens.map((t) => `${t.agent}@${t.store} (${t.mode}${t.where ? ", where" : ""})`).join(", ")}`
            : "";
        // Exposure printout (step 3 ergonomics): on a non-loopback bind the
        // operator sees the reachable addresses — the exact URLs to hand a
        // remote agent — and the transport reminder (TLS is the proxy's job).
        let exposureNote = "";
        if (!isLoopbackHost(host)) {
          const addresses = exposedAddresses(host);
          exposureNote = addresses.length > 0
            ? `\n  exposed: ${addresses.map((a) => `http://${a}:${port}`).join(", ")}` +
              `\n  note: plaintext HTTP — terminate TLS at a reverse proxy (Caddy/nginx) or use a private overlay (Tailscale/WireGuard); the bearer boundary travels end-to-end`
            : `\n  exposed: (no reachable interface found for ${host})`;
        }
        process.stdout.write(
          `souvenance server listening on http://${host}:${port} (db: ${store.dbPath})${storesNote}${tokensNote}${exposureNote}\n`,
        );
        await new Promise((resolve) => {
          const stop = () => {
            server.close();
            resolve();
          };
          process.on("SIGINT", stop);
          process.on("SIGTERM", stop);
        });
        break;
      }
      default:
        fail(`unknown command: ${command}\n\n${HELP}`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    for (const aux of auxiliaries) aux.close();
    store.close();
  }
  if (exitCode !== 0) process.exit(exitCode);
}

main();
