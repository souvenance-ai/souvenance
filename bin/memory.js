#!/usr/bin/env node
import { Store } from "../src/db.ts";

const HELP = `Usage: memory <command> [args] [flags]

Commands:
  store <content> [--metadata <json>]          Store a new memory, print its id
  update <id> [--content <text>] [--metadata <json>]   Update a memory
  delete <id>                                 Delete a memory (cascades edges)
  link <from-id> <to-id> --kind <kind> [--metadata <json>]  Create a typed edge
  search <query> [--where <sql>] [--limit N]  FTS5 search, ranked results as JSON
  get <id>                                    Print a memory as JSON (or "not found")
  list [--where <sql>] [--limit N] [--offset N]  List memories by metadata filter
  relations <id> [--direction out|in|both]    List edges to/from a memory
  stats                                       Print store statistics as JSON

Flags:
  --db <path>   Override the DB path (default: .ai-memory/memory.db)
  --help, -h    Show this help

Output:
  stdout: JSON results (one document per command)
  stderr: error messages
  exit:   0 on success, 1 on error

Notes:
  --metadata accepts a JSON string: '{"tags":["a"],"kind":"note"}'
  --where accepts a raw SQL fragment on the metadata JSON column using SQLite
    JSON operators, e.g.: metadata->>'$.kind' = 'note'
`;

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
      const val = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[i + 1];
      if (!a.includes("=")) i++;
      flags[key] = val;
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

function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || args.length === 0) {
    process.stdout.write(HELP);
    return;
  }

  const command = args[0];
  const rest = args.slice(1);

  const dbPath = flags["--db"];
  let store;
  try {
    store = Store.open(dbPath ? { dbPath } : {});
  } catch (err) {
    fail(`could not open store: ${err instanceof Error ? err.message : err}`);
  }

  try {
    switch (command) {
      case "store": {
        if (rest.length < 1) fail("store requires <content>");
        const content = rest[0];
        const metadata = parseMetadata(flags["--metadata"]);
        const id = store.store(content, metadata ? { metadata } : {});
        process.stdout.write(id + "\n");
        break;
      }
      case "update": {
        if (rest.length < 1) fail("update requires <id>");
        const id = rest[0];
        const content = flags["--content"];
        const metadata = parseMetadata(flags["--metadata"]);
        store.update(id, {
          ...(content !== undefined ? { content } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
        });
        process.stdout.write("updated\n");
        break;
      }
      case "delete": {
        if (rest.length < 1) fail("delete requires <id>");
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
        });
        print(results);
        break;
      }
      case "relations": {
        if (rest.length < 1) fail("relations requires <id>");
        const direction = flags["--direction"];
        const results = store.relations(rest[0], {
          ...(direction ? { direction } : {}),
        });
        print(results);
        break;
      }
      case "stats": {
        print(store.stats());
        break;
      }
      default:
        fail(`unknown command: ${command}\n\n${HELP}`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    store.close();
  }
}

main();
