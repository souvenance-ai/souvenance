import { readFileSync } from "node:fs";
import { Store } from "./db.ts";
import type { Direction } from "./types.ts";

/**
 * MCP stdio server — the third thin surface over the deep module (after the
 * CLI and the HTTP server). `memory mcp` speaks JSON-RPC 2.0 on stdin/stdout
 * (newline-delimited), so any MCP client mounts the store as typed tools
 * without the markdown skill.
 *
 * The mirror rule is the HTTP server's, reused: tools mirror the CLI verbs
 * 1:1 and return the same JSON shapes as CLI stdout — an MCP agent parses
 * exactly what a bash agent parses. The trust zone is the same too: stdio is
 * the agent's own process (loopback equivalent), so no bearer tokens; raw
 * `where` fragments stay available; cross-machine consumption remains the
 * HTTP server's job.
 *
 * Transport is hand-rolled (decision ae1259fd): the needed subset is small
 * and stable — initialize (echo the client's protocolVersion when it is one
 * we speak, else the server's latest), tools/list, tools/call, ping; every
 * `notifications/*` method is ignored silently; unknown requests get -32601.
 * The @modelcontextprotocol/sdk was rejected: a new dependency tree (zod et
 * al.) for a surface this thin, in a repo that hand-rolls its small
 * interfaces.
 *
 * stdout is protocol-only (JSON-RPC lines); anything an implementation wants
 * to say to a human goes to stderr — never mix the two (an MCP client parses
 * stdout byte-for-byte, so stray output corrupts the stream).
 */

const SERVER_NAME = "ai-memory";
/** The revision this server answers with when the client requests an unknown one. */
const PROTOCOL_VERSION = "2025-06-18";
const KNOWN_PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]);

/** Read from package.json at open — single source of truth, no hand-sync. */
function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: string;
    };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Injected into the client's system prompt at initialize — the MCP-native
 *  place where the identity ritual reaches an agent that never loaded the
 *  markdown skill (decision ae1259fd). */
const INSTRUCTIONS = `ai-memory: a persistent, searchable memory for agents — markdown memories in a per-project SQLite store, connected by a typed directed graph.

Ritual: run recover FIRST — it loads the binding directives, the latest summaries (the handoff from prior sessions) and the store stats. Search when you need context you don't have; trust the summaries as the recovery point.
Write one concept per memory, self-contained, with search keywords in the text (search matches tokens, not semantics). Link new memories to related ones — an unlinked memory is an island.
Content is immutable: supersede a changed decision, deprecate a stale one, merge duplicates — delete only with force. Weight is importance 0-1 (0.9 binding, 0.5 routine).`;

/** Argument readers — every tool validates its own inputs so the lib receives
 *  exactly the types its options declare. Errors surface as tool-level
 *  isError results, never as JSON-RPC protocol errors. */
type Args = Record<string, unknown>;

function optString(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`'${key}' must be a string`);
  return v;
}

function requireString(args: Args, key: string): string {
  const v = optString(args, key);
  if (v === undefined) throw new Error(`'${key}' is required`);
  return v;
}

/** Integers, refused below 0 — a negative limit would disable the SQL LIMIT,
 *  not extend it (the HTTP decision, applied to the stdio surface too). */
function optInteger(args: Args, key: string, min = 0): number | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`'${key}' must be an integer`);
  if (v < min) throw new Error(`'${key}' must be >= ${min}`);
  return v;
}

/** Weights are validated here — the lib trusts its options (checkWeight is
 *  HTTP-only by design), so every write-surface re-checks 0..1. */
function optWeight(args: Args): number | undefined {
  const v = args["weight"];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new Error(`'weight' must be a number between 0 and 1`);
  }
  return v;
}

/** Metadata must be a plain JSON object — the lib stringifies verbatim, so a
 *  string here would double-encode. */
function optObject(args: Args, key: string): Record<string, unknown> | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Error(`'${key}' must be a JSON object`);
  }
  return v as Record<string, unknown>;
}

function optBoolean(args: Args, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw new Error(`'${key}' must be a boolean`);
  return v;
}

const DIRECTIONS: Direction[] = ["in", "out", "both"];

function storeOptions(args: Args): { metadata?: Record<string, unknown>; weight?: number } {
  const opts: { metadata?: Record<string, unknown>; weight?: number } = {};
  const metadata = optObject(args, "metadata");
  if (metadata !== undefined) opts.metadata = metadata;
  const weight = optWeight(args);
  if (weight !== undefined) opts.weight = weight;
  return opts;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run(store: Store, args: Args): unknown;
}

/** The CLI verb set, mirrored 1:1 (the HTTP ENDPOINTS pattern). Arg names are
 *  snake_case; `all` maps to the lib's includeLegacy like the CLI --all. */
export const TOOLS: McpTool[] = [
  {
    name: "recover",
    description:
      "The recovery ritual in one call: binding directives (kind: directive, latest 20), the latest 3 summaries (prior sessions' handoff) and store stats. Run this FIRST, before any work.",
    inputSchema: {
      type: "object",
      properties: {
        directives_limit: { type: "integer", minimum: 0, description: "default 20" },
        summaries_limit: { type: "integer", minimum: 0, description: "default 3" },
      },
    },
    run: (store, args) => ({
      directives: store.list({
        where: "metadata->>'$.kind' = 'directive'",
        limit: optInteger(args, "directives_limit") ?? 20,
      }),
      summaries: store.list({
        where: "metadata->>'$.kind' = 'summary'",
        limit: optInteger(args, "summaries_limit") ?? 3,
      }),
      stats: store.stats(),
    }),
  },
  {
    name: "store",
    description:
      "Store a new memory. One concept per memory, self-contained, search keywords in the text. Returns {id}.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "markdown, self-contained" },
        metadata: { type: "object", description: 'e.g. {"kind":"decision","tags":["a"]}' },
        weight: { type: "number", minimum: 0, maximum: 1, description: "importance 0-1, default 0.5" },
      },
      required: ["content"],
    },
    run: (store, args) => ({ id: store.store(requireString(args, "content"), storeOptions(args)) }),
  },
  {
    name: "supersede",
    description:
      "Revise a decision: stores new content as an active memory, links the old one to it via supersedes and marks it superseded. Content is immutable — this is how decisions change. Returns {id}.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        content: { type: "string" },
        metadata: { type: "object", description: "override; default: inherit kind and tags from the source" },
        weight: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["id", "content"],
    },
    run: (store, args) => ({
      id: store.supersede(requireString(args, "id"), requireString(args, "content"), storeOptions(args)),
    }),
  },
  {
    name: "merge",
    description:
      "Combine duplicate memories: stores one merged memory (active), marks each original as merged and links them via merges. Returns {id}.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, minItems: 2 },
        content: { type: "string" },
        metadata: { type: "object" },
        weight: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["ids", "content"],
    },
    run: (store, args) => {
      const ids = args["ids"];
      if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
        throw new Error("'ids' must be an array of memory ids");
      }
      return { id: store.merge(ids as string[], requireString(args, "content"), storeOptions(args)) };
    },
  },
  {
    name: "update",
    description:
      "Adjust only the mutable surface: metadata and/or weight. Content is immutable — use supersede to revise text.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        metadata: { type: "object" },
        weight: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["id"],
    },
    run: (store, args) => {
      const id = requireString(args, "id");
      const opts: { metadata?: Record<string, unknown>; weight?: number } = {};
      const metadata = optObject(args, "metadata");
      if (metadata !== undefined) opts.metadata = metadata;
      const weight = optWeight(args);
      if (weight !== undefined) opts.weight = weight;
      if (opts.metadata === undefined && opts.weight === undefined) {
        throw new Error("update requires metadata or weight (content is immutable; use supersede to revise)");
      }
      store.update(id, opts);
      return "updated";
    },
  },
  {
    name: "link",
    description: "Create a typed directed edge between two memories. An unlinked memory is an island.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        kind: { type: "string", description: "edge type, e.g. references, extends, continues" },
        metadata: { type: "object" },
      },
      required: ["from", "to", "kind"],
    },
    run: (store, args) => {
      store.link(requireString(args, "from"), requireString(args, "to"), requireString(args, "kind"), storeOptions(args));
      return "linked";
    },
  },
  {
    name: "deprecate",
    description: "Soft-delete: hides the memory from default search and list without removing it.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (store, args) => {
      store.deprecate(requireString(args, "id"));
      return "deprecated";
    },
  },
  {
    name: "delete",
    description: "Hard delete — destructive and irreversible. Prefer deprecate.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, force: { type: "boolean", description: "must be true" } },
      required: ["id"],
    },
    run: (store, args) => {
      const id = requireString(args, "id");
      if (args["force"] !== true) {
        throw new Error("delete is destructive: pass force: true, or prefer the deprecate tool");
      }
      store.delete(id);
      return "deleted";
    },
  },
  {
    name: "get",
    description: "Read one memory by id (as-is, including its status); bumps its access_count.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (store, args) => store.get(requireString(args, "id")),
  },
  {
    name: "search",
    description:
      "FTS5 keyword search over active memories (BM25 x weight x recency). Matches whole tokens, not substrings: a single word is the broadest query; OR widens the net; quoted phrases match consecutive words; quote hyphenated identifiers. Returns ranked memories with their rank.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        where: { type: "string", description: "raw SQL fragment over metadata (JSON1), e.g. metadata->>'$.kind' = 'note'" },
        limit: { type: "integer", minimum: 0 },
        all: { type: "boolean", description: "include superseded/deprecated/merged" },
      },
      required: ["query"],
    },
    run: (store, args) => {
      const all = optBoolean(args, "all");
      const limit = optInteger(args, "limit");
      return store.search(requireString(args, "query"), {
        where: optString(args, "where"),
        ...(limit !== undefined ? { limit } : {}),
        ...(all !== undefined ? { includeLegacy: all } : {}),
      });
    },
  },
  {
    name: "list",
    description: "List memories (active only unless all), newest first.",
    inputSchema: {
      type: "object",
      properties: {
        where: { type: "string", description: "raw SQL fragment over metadata (JSON1)" },
        limit: { type: "integer", minimum: 0 },
        offset: { type: "integer", minimum: 0 },
        min_weight: { type: "number", minimum: 0, maximum: 1 },
        all: { type: "boolean", description: "include superseded/deprecated/merged" },
      },
    },
    run: (store, args) => {
      const all = optBoolean(args, "all");
      const limit = optInteger(args, "limit");
      const offset = optInteger(args, "offset");
      const minWeight = args["min_weight"];
      if (minWeight !== undefined && (typeof minWeight !== "number" || !Number.isFinite(minWeight))) {
        throw new Error("'min_weight' must be a number");
      }
      return store.list({
        where: optString(args, "where"),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
        ...(minWeight !== undefined ? { minWeight: minWeight as number } : {}),
        ...(all !== undefined ? { includeLegacy: all } : {}),
      });
    },
  },
  {
    name: "relations",
    description: "The graph edges of one memory, either direction or both; resolve annotates superseded/merged targets with their terminal successor.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        direction: { type: "string", enum: DIRECTIONS, description: "default both" },
        resolve: { type: "boolean" },
      },
      required: ["id"],
    },
    run: (store, args) => {
      const id = requireString(args, "id");
      const direction = optString(args, "direction") ?? "both";
      if (!DIRECTIONS.includes(direction as Direction)) {
        throw new Error(`'direction' must be one of: ${DIRECTIONS.join(", ")}`);
      }
      const resolve = optBoolean(args, "resolve");
      return store.relations(id, {
        direction: direction as Direction,
        ...(resolve !== undefined ? { resolve } : {}),
      });
    },
  },
  {
    name: "tags",
    description: "All distinct tags with counts.",
    inputSchema: {
      type: "object",
      properties: {
        where: { type: "string" },
        all: { type: "boolean" },
      },
    },
    run: (store, args) => {
      const all = optBoolean(args, "all");
      return store.tags({ where: optString(args, "where"), ...(all !== undefined ? { includeLegacy: all } : {}) });
    },
  },
  {
    name: "stats",
    description: "Store statistics: memory counts by status, edges by kind, total accesses.",
    inputSchema: { type: "object", properties: {} },
    run: (store) => store.stats(),
  },
  {
    name: "doctor",
    description:
      "Integrity report (links, edges, kinds, weights, FTS). fix: true rebuilds the FTS index — the one mechanical repair; other findings are repaired by supersede/merge/update/link.",
    inputSchema: { type: "object", properties: { fix: { type: "boolean" } } },
    run: (store, args) => {
      const fix = optBoolean(args, "fix");
      return store.doctor({ ...(fix !== undefined ? { fix } : {}) });
    },
  },
];

export interface McpStreams {
  input: AsyncIterable<Uint8Array | string>;
  output: { write(data: string): void };
}

type Responder = (id: unknown, payload: { result?: unknown; error?: { code: number; message: string } }) => void;

/** Reads newline-delimited JSON-RPC from input, writes responses to output,
 *  returns when input ends (the CLI closes the store after this). */
export async function runMcpServer(
  store: Store,
  streams: McpStreams = { input: process.stdin, output: process.stdout },
): Promise<void> {
  const respond: Responder = (id, payload) => {
    const body =
      payload.error !== undefined
        ? { jsonrpc: "2.0", id, error: payload.error }
        : { jsonrpc: "2.0", id, result: payload.result };
    streams.output.write(JSON.stringify(body) + "\n");
  };
  let buffer = "";
  for await (const chunk of streams.input) {
    buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length === 0) continue;
      handleMessage(store, line, respond);
    }
  }
}

/** Dispatches one protocol line. Notifications (`notifications/*`) are never
 *  responded to; every request gets exactly one response line. */
function handleMessage(store: Store, line: string, respond: Responder): void {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    respond(null, { error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (typeof msg !== "object" || msg === null) {
    respond(null, { error: { code: -32600, message: "Invalid Request" } });
    return;
  }
  const m = msg as { method?: unknown; id?: unknown; params?: unknown };
  if (typeof m.method !== "string") {
    if (m.id !== undefined) respond(m.id, { error: { code: -32600, message: "Invalid Request" } });
    return;
  }
  if (m.method.startsWith("notifications/")) return;
  switch (m.method) {
    case "initialize": {
      const params = (typeof m.params === "object" && m.params !== null ? m.params : {}) as Record<string, unknown>;
      const requested = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : undefined;
      const protocolVersion =
        requested !== undefined && KNOWN_PROTOCOL_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION;
      respond(m.id, {
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: packageVersion() },
          instructions: INSTRUCTIONS,
        },
      });
      return;
    }
    case "ping":
      respond(m.id, { result: {} });
      return;
    case "tools/list":
      respond(m.id, {
        result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
      });
      return;
    case "tools/call": {
      const params = (typeof m.params === "object" && m.params !== null ? m.params : {}) as Record<string, unknown>;
      const name = params["name"];
      const tool = typeof name === "string" ? TOOLS.find((t) => t.name === name) : undefined;
      if (!tool) {
        respond(m.id, {
          result: { content: [{ type: "text", text: `unknown tool '${String(name)}'` }], isError: true },
        });
        return;
      }
      const rawArgs = params["arguments"];
      const args =
        typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
          ? (rawArgs as Args)
          : {};
      try {
        const result = tool.run(store, args);
        respond(m.id, { result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
      } catch (err) {
        respond(m.id, {
          result: {
            content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            isError: true,
          },
        });
      }
      return;
    }
    default:
      respond(m.id, { error: { code: -32601, message: `Method not found: ${m.method}` } });
  }
}
