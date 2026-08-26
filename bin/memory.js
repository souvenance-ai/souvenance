#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../src/db.ts";
import { slugify, filenameFor, renderMemory } from "../src/export.ts";

const HELP = `Usage: memory <command> [args] [flags]

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
  relations <id> [--direction out|in|both]    List edges to/from a memory
  stats                                       Print store statistics as JSON
  tags [--where <sql>] [--all]               List all distinct tags with counts, as JSON
  export [--output <dir>]                     Export the entire store as a flat directory of markdown files

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
  export writes one .md file per memory (all statuses) with YAML frontmatter;
    memory:// links are rewritten to relative file links; idempotent
`;

const BOOLEAN_FLAGS = new Set(["--all", "--force"]);

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
