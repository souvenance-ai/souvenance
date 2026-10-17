import { Hono, type Context, type Next } from "hono";
import { Store } from "./db.ts";
import type { Direction, StoreOptions, UpdateOptions } from "./types.ts";

/**
 * HTTP surface over a Store — the server consumes the LIB, not the CLI
 * (the big-store bench: ~1.3ms lib get vs ~40-100ms CLI process spawn).
 *
 * Increment 1 (232b645) served exactly one store per process. Increment 2
 * adds multi-store: the ROOT routes keep serving the process's own store
 * (--db, one agent = one store, decision a4950b47) and each auxiliary store
 * declared with `--store <name>=<path>[:rw]` mounts the same verb routes at
 * /<name>/.... Auxiliary stores are READ-ONLY by default — the mechanical
 * enforcement of personality isolation: an agent cannot write into another
 * store through its server; `:rw` is the explicit opt-in (the evaluator
 * exception). They open lazily on first request through an injected
 * `openStore` factory so the caller owns their lifecycle.
 *
 * Routes mirror the CLI verbs 1:1 and return the same JSON shapes, so an
 * HTTP client gets the exact contract documented in SKILL.md / bin HELP.
 * `--where` fragments pass through unvalidated, same trust level as the CLI
 * (local, single-user, no untrusted input path).
 */

/** Default listen address for `memory serve`. */
export const DEFAULT_PORT = 3141;
export const DEFAULT_HOST = "127.0.0.1";

/** An error with a decided HTTP status (raised by handler-level validation). */
export class HttpError extends Error {
  status: 400 | 404 | 409 | 503;

  constructor(status: 400 | 404 | 409 | 503, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Maps any thrown error to an HTTP status. Library errors are classified by
 * message (the lib is the source of truth; the server never re-wraps):
 * - "memory not found: <id>"          -> 404
 * - "cannot <verb> a memory with ..." -> 409 (wrong lifecycle state)
 * - FTS5 syntax / bad --where column  -> 400 (after the lib's own sanitize
 *   fallback has had its chance)
 * - "database is locked" (BUSY retries exhausted) -> 503 (retry later)
 */
export function statusFor(err: unknown): 400 | 404 | 409 | 500 | 503 {
  if (err instanceof HttpError) return err.status;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith("memory not found:")) return 404;
  if (/^cannot .* a memory with status '/.test(msg)) return 409;
  if (/database is locked/i.test(msg)) return 503;
  // Remaining library errors are input-validation ("content must be
  // non-empty", "merge requires at least 2 memories", "duplicate id in
  // merge: <id>", FTS5 syntax, bad --where column) -> 400.
  if (/\b(must be|requires|duplicate id)\b/.test(msg)) return 400;
  if (/fts5:\s*syntax error/i.test(msg) || /no such column/i.test(msg)) return 400;
  return 500;
}

/** Serving mode of a declared auxiliary store: read-only unless opted in. */
export type StoreMode = "ro" | "rw";

/** An auxiliary store declared on the command line. */
export interface DeclaredStore {
  name: string;
  dbPath: string;
  mode: StoreMode;
}

export interface MultiStoreOptions {
  /** Auxiliary stores mounted at /<name>/..., read-only by default. */
  stores?: DeclaredStore[];
  /**
   * Opens an auxiliary store on first request (default: Store.open).
   * Injected so the caller owns the lifecycle of lazily opened stores.
   */
  openStore?: (dbPath: string) => Store;
}

/** Root route names a store must not shadow. */
const RESERVED_STORE_NAMES = new Set(["search", "memories", "merge", "stats", "tags", "doctor"]);

/**
 * Parses a `--store <name>=<path>[:rw]` spec. The name becomes a URL segment
 * (lowercase letters, digits, hyphens; must start with a letter) and is
 * checked against the reserved root routes. The path may contain "=" and
 * ":"; the mode suffix is the exact terminal ":rw".
 */
export function parseStoreSpec(spec: string): DeclaredStore {
  const eq = spec.indexOf("=");
  if (eq < 1) {
    throw new Error(`--store expects <name>=<path>[:rw], got: ${spec}`);
  }
  const name = spec.slice(0, eq);
  let dbPath = spec.slice(eq + 1);
  let mode: StoreMode = "ro";
  if (dbPath.endsWith(":rw")) {
    mode = "rw";
    dbPath = dbPath.slice(0, -3);
  }
  if (dbPath.length === 0) {
    throw new Error(`--store '${name}' requires a db path`);
  }
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) {
    throw new Error(
      `invalid store name '${name}': lowercase letters, digits and hyphens, starting with a letter`,
    );
  }
  if (RESERVED_STORE_NAMES.has(name)) {
    throw new Error(`store name '${name}' is reserved by root routes; pick another name`);
  }
  return { name, dbPath, mode };
}

/** Parses the JSON body; an empty body is `{}` (e.g. POST /doctor). */
async function readJson(c: Context): Promise<Record<string, unknown>> {
  const raw = await c.req.text();
  if (raw.trim() === "") return {};
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "request body must be valid JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

function requireContent(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new HttpError(400, "content must be a non-empty string");
  }
  return v;
}

function checkMetadata(v: unknown): Record<string, unknown> | undefined {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new HttpError(400, "metadata must be a JSON object");
  }
  return v as Record<string, unknown>;
}

function checkWeight(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new HttpError(400, "weight must be a number between 0 and 1");
  }
  return v;
}

function numQuery(q: string | undefined, name: string): number | undefined {
  if (q === undefined) return undefined;
  const n = Number(q);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, `${name} must be a number, got: ${q}`);
  }
  return n;
}

/** Query-string booleans: present as "1"/"true" means on. */
function boolQuery(q: string | undefined): boolean {
  return q === "1" || q === "true";
}

function directionQuery(q: string | undefined): Direction {
  if (q === undefined) return "both";
  if (q === "in" || q === "out" || q === "both") return q;
  throw new HttpError(400, `direction must be in, out or both, got: ${q}`);
}

/** Collects the common {metadata, weight} body fields into StoreOptions. */
function storeOptions(body: Record<string, unknown>): StoreOptions {
  const opts: StoreOptions = {};
  const metadata = checkMetadata(body["metadata"]);
  if (metadata !== undefined) opts.metadata = metadata;
  const weight = checkWeight(body["weight"]);
  if (weight !== undefined) opts.weight = weight;
  return opts;
}

const ENDPOINTS: Array<{ method: string; path: string; note: string }> = [
  { method: "POST", path: "/memories", note: "store {content, metadata?, weight?} -> 201 {id}" },
  { method: "GET", path: "/memories", note: "list ?where&limit&offset&min-weight&all" },
  { method: "GET", path: "/memories/:id", note: "get (bumps access_count)" },
  { method: "PATCH", path: "/memories/:id", note: "update {metadata?, weight?}" },
  { method: "DELETE", path: "/memories/:id", note: "hard delete, requires ?force=1 (prefer deprecate)" },
  { method: "POST", path: "/memories/:id/supersede", note: "supersede {content, metadata?, weight?} -> 201 {id}" },
  { method: "POST", path: "/memories/:id/deprecate", note: "soft-delete" },
  { method: "POST", path: "/memories/:id/link", note: "link {to, kind, metadata?} -> 201" },
  { method: "GET", path: "/memories/:id/relations", note: "relations ?direction=in|out|both&resolve=1" },
  { method: "POST", path: "/merge", note: "merge {ids, content, metadata?, weight?} -> 201 {id}" },
  { method: "GET", path: "/search", note: "search ?q&where&limit&all" },
  { method: "GET", path: "/stats", note: "store statistics" },
  { method: "GET", path: "/tags", note: "tags ?where&all" },
  { method: "GET", path: "/doctor", note: "integrity report" },
  { method: "POST", path: "/doctor", note: "integrity report, {fix:true} rebuilds the FTS index" },
];

type StoreResolver = () => Store;

/**
 * Middleware rejecting every write on a read-only store. POST /doctor
 * {fix:true} rebuilds the FTS index — a write — so it is blocked too.
 */
function readOnlyGuard(name: string) {
  return async (c: Context, next: Next) => {
    if (c.req.method !== "GET") {
      throw new HttpError(
        409,
        `store '${name}' is served read-only; to allow writes, serve it with mode 'rw'`,
      );
    }
    await next();
  };
}

/**
 * Registers the verb routes (the CLI contract) on `app` under `prefix`,
 * resolving the target store per request through `resolve`. The root
 * registration passes prefix "" over the process's own store; each declared
 * auxiliary store registers its own prefixed copy with its own (lazy)
 * accessor, and read-only stores get the write guard.
 */
function registerStoreRoutes(app: Hono, prefix: string, resolve: StoreResolver, roName?: string): void {
  if (roName !== undefined) {
    app.use(`${prefix}/*`, readOnlyGuard(roName));
  }

  app.post(`${prefix}/memories`, async (c) => {
    const body = await readJson(c);
    const id = resolve().store(requireContent(body["content"]), storeOptions(body));
    return c.json({ id }, 201);
  });

  app.get(`${prefix}/memories`, (c) => {
    const limit = numQuery(c.req.query("limit"), "limit");
    const offset = numQuery(c.req.query("offset"), "offset");
    const minWeight = numQuery(c.req.query("min-weight"), "min-weight");
    return c.json(
      resolve().list({
        where: c.req.query("where"),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
        ...(minWeight !== undefined ? { minWeight } : {}),
        includeLegacy: boolQuery(c.req.query("all")),
      }),
    );
  });

  app.get(`${prefix}/memories/:id`, (c) => {
    const id = c.req.param("id");
    const memory = resolve().get(id);
    if (!memory) throw new HttpError(404, `memory not found: ${id}`);
    return c.json(memory);
  });

  app.patch(`${prefix}/memories/:id`, async (c) => {
    const body = await readJson(c);
    const opts: UpdateOptions = {};
    const metadata = checkMetadata(body["metadata"]);
    if (metadata !== undefined) opts.metadata = metadata;
    const weight = checkWeight(body["weight"]);
    if (weight !== undefined) opts.weight = weight;
    if (metadata === undefined && weight === undefined) {
      throw new HttpError(400, "update requires metadata and/or weight");
    }
    resolve().update(c.req.param("id"), opts);
    return c.body(null, 204);
  });

  app.delete(`${prefix}/memories/:id`, (c) => {
    const id = c.req.param("id");
    if (!boolQuery(c.req.query("force"))) {
      throw new HttpError(
        409,
        "delete is destructive: repeat with ?force=1, or prefer POST /memories/:id/deprecate",
      );
    }
    resolve().delete(id);
    return c.body(null, 204);
  });

  app.post(`${prefix}/memories/:id/supersede`, async (c) => {
    const body = await readJson(c);
    const id = resolve().supersede(
      c.req.param("id"),
      requireContent(body["content"]),
      storeOptions(body),
    );
    return c.json({ id }, 201);
  });

  app.post(`${prefix}/memories/:id/deprecate`, (c) => {
    const id = c.req.param("id");
    resolve().deprecate(id);
    return c.json({ id, status: "deprecated" });
  });

  app.post(`${prefix}/memories/:id/link`, async (c) => {
    const from = c.req.param("id");
    const body = await readJson(c);
    if (typeof body["to"] !== "string" || body["to"].length === 0) {
      throw new HttpError(400, "to must be a memory id string");
    }
    if (typeof body["kind"] !== "string" || body["kind"].length === 0) {
      throw new HttpError(400, "kind must be a non-empty string");
    }
    const to = body["to"];
    const kind = body["kind"];
    resolve().link(from, to, kind, { metadata: checkMetadata(body["metadata"]) ?? {} });
    return c.json({ from_id: from, to_id: to, kind }, 201);
  });

  app.get(`${prefix}/memories/:id/relations`, (c) => {
    return c.json(
      resolve().relations(c.req.param("id"), {
        direction: directionQuery(c.req.query("direction")),
        resolve: boolQuery(c.req.query("resolve")),
      }),
    );
  });

  app.post(`${prefix}/merge`, async (c) => {
    const body = await readJson(c);
    if (!Array.isArray(body["ids"]) || body["ids"].length === 0) {
      throw new HttpError(400, "ids must be a non-empty array of memory ids");
    }
    for (const id of body["ids"]) {
      if (typeof id !== "string") {
        throw new HttpError(400, "ids must be memory id strings");
      }
    }
    const id = resolve().merge(body["ids"] as string[], requireContent(body["content"]), storeOptions(body));
    return c.json({ id }, 201);
  });

  app.get(`${prefix}/search`, (c) => {
    const q = c.req.query("q");
    if (!q) throw new HttpError(400, "q must be non-empty");
    const limit = numQuery(c.req.query("limit"), "limit");
    return c.json(
      resolve().search(q, {
        where: c.req.query("where"),
        ...(limit !== undefined ? { limit } : {}),
        includeLegacy: boolQuery(c.req.query("all")),
      }),
    );
  });

  app.get(`${prefix}/stats`, (c) => c.json(resolve().stats()));

  app.get(`${prefix}/tags`, (c) =>
    c.json(
      resolve().tags({
        where: c.req.query("where"),
        includeLegacy: boolQuery(c.req.query("all")),
      }),
    ),
  );

  app.get(`${prefix}/doctor`, (c) => c.json(resolve().doctor()));

  app.post(`${prefix}/doctor`, async (c) => {
    const body = await readJson(c);
    return c.json(resolve().doctor({ fix: body["fix"] === true }));
  });
}

/**
 * Builds the app: root routes over the process's own store (always
 * read-write — it IS the agent's identity), plus each declared auxiliary
 * store mounted at /<name>/... Auxiliary stores open lazily via `openStore`
 * and duplicate names fail fast at construction.
 */
export function createApp(store: Store, opts: MultiStoreOptions = {}): Hono {
  const declared = opts.stores ?? [];
  const seen = new Set<string>();
  for (const d of declared) {
    if (seen.has(d.name)) throw new Error(`duplicate store name: ${d.name}`);
    seen.add(d.name);
  }

  const app = new Hono();

  app.get("/", (c) =>
    c.json({
      name: "ai-memory",
      endpoints: ENDPOINTS,
      ...(declared.length > 0
        ? {
            stores: declared.map(({ name, dbPath, mode }) => ({ name, db: dbPath, mode })),
            note: "auxiliary stores mount at /<name>/...; they are read-only unless declared with mode 'rw'",
          }
        : {}),
    }),
  );

  // Root: the process's own store (one agent = one store, decision a4950b47).
  registerStoreRoutes(app, "", () => store);

  // Auxiliary stores: opened lazily on first request; the openStore seam lets
  // the caller (bin) own their lifecycle and close them after shutdown.
  const openStore = opts.openStore ?? ((dbPath: string) => Store.open({ dbPath }));
  const opened = new Map<string, Store>();
  for (const d of declared) {
    const resolve = (): Store => {
      let s = opened.get(d.name);
      if (!s) {
        s = openStore(d.dbPath);
        opened.set(d.name, s);
      }
      return s;
    };
    registerStoreRoutes(app, `/${d.name}`, resolve, d.mode === "ro" ? d.name : undefined);
  }

  app.notFound((c) => c.json({ error: "not found" }, 404));

  app.onError((err, c) => c.json({ error: err.message }, statusFor(err)));

  return app;
}
