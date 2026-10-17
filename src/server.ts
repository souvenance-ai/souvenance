import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
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
 * Increment 4 (8769eee8) adds the trust boundary: bearer-token grants
 * (`--token <agent>=<secret>[@<store>][:rw][:where]`), one token = one agent
 * bound to one store, read-only by default; non-loopback binds refuse to
 * start without tokens; raw `where` fragments stay local-only (per-token
 * :where opt-in), with server-compiled kind/tag structured filters as the
 * remote-safe alternative (95556ca0 step 2).
 *
 * Increment 5 (95556ca0 step 3, transport/exposure): request caps and
 * timeouts (1 MiB body cap -> 413, ?limit cap 1000 and integer validation
 * -> 400, explicit server timeouts wired in bin), the exposure printout
 * (exposedAddresses resolves a non-loopback bind to its reachable
 * addresses), and the TLS decision: reverse proxy, never built-in — the
 * server stays plain HTTP, the bearer boundary travels end-to-end.
 *
 * Token-file provisioning (decision 4429801d): `--token-file <path>` reads an
 * env-style file so bearer secrets never ride in argv (`ps aux` and
 * `/proc/<pid>/cmdline` are world-readable).
 *
 * Routes mirror the CLI verbs 1:1 and return the same JSON shapes, so an
 * HTTP client gets the exact contract documented in SKILL.md / bin HELP.
 */

/** Default listen address for `memory serve`. */
export const DEFAULT_PORT = 3141;
export const DEFAULT_HOST = "127.0.0.1";

/**
 * Request body cap — the largest legal store/supersede/merge payload
 * (1 MiB of markdown is far beyond any real memory; an uncapped read
 * would let one request pin the process). Oversized bodies -> 413.
 */
export const MAX_BODY_BYTES = 1024 * 1024;
/**
 * Cap on every `?limit=` over HTTP (list, search, recover). 1000 dwarfs
 * any real page; bulk reads are the CLI's export verb, not an unbounded
 * remote list. Negative limits would DISABLE the SQL LIMIT (SQLite:
 * LIMIT -1 = no limit) — rejected with the non-integer forms.
 */
export const MAX_LIMIT = 1000;

/** The long-lived listener's explicit timeouts (wired in bin/memory.js). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const HEADERS_TIMEOUT_MS = 10_000;
export const KEEPALIVE_TIMEOUT_MS = 5_000;

/** An error with a decided HTTP status (raised by handler-level validation). */
export class HttpError extends Error {
  status: 400 | 401 | 403 | 404 | 409 | 413 | 503;

  constructor(status: 400 | 401 | 403 | 404 | 409 | 413 | 503, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Maps any thrown error to an HTTP status. Library errors are classified by
 * message (the lib is the source of truth; the server never re-wraps):
 * - "memory not found: <id>"          -> 404
 * - "cannot <verb> a memory with ..." -> 409 (wrong lifecycle state)
 * - "store is read-only ..."          -> 409 (the lib-level floor behind a
 *   ro mount; same serving-mode conflict family)
 * - FTS5 syntax / bad --where column  -> 400 (after the lib's own sanitize
 *   fallback has had its chance)
 * - "database is locked" (BUSY retries exhausted) -> 503 (retry later)
 * 401/403 never come from the lib — the auth layer raises them as HttpError
 * before any store resolution (decision 8769eee8, increment 4).
 */
export function statusFor(err: unknown): 400 | 401 | 403 | 404 | 409 | 413 | 500 | 503 {
  if (err instanceof HttpError) return err.status;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith("memory not found:")) return 404;
  if (/^cannot .* a memory with status '/.test(msg)) return 409;
  // The store itself refuses (read-only open) — the lib-level floor behind
  // the ro mount middleware; 409 like every serving-mode conflict.
  if (/^store is read-only/.test(msg)) return 409;
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

/** The app's context carries the authenticated grant in token mode. */
type MemoryEnv = { Variables: { tokenGrant: TokenGrant } };
type MemoryApp = Hono<MemoryEnv>;
type MemoryContext = Context<MemoryEnv>;

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
   * The second argument is the caller's readonly decision: true for a
   * ro-declared mount in local mode — in token mode mounts open writable
   * and the per-token auth layer governs writes (increment 4).
   */
  openStore?: (dbPath: string, readOnly: boolean) => Store;
  /**
   * Bearer-token grants (increment 4, decision 8769eee8). Declaring any
   * token switches the server to token mode: EVERY request must present a
   * valid token, each scoped to its granted store (403 elsewhere), writes
   * require the token's rw opt-in (409) and raw `where` fragments require
   * the :where opt-in (400).
   */
  tokens?: TokenGrant[];
  /**
   * The address the server binds. Non-loopback hosts (anything but
   * 127.0.0.1, ::1, localhost) REQUIRE tokens — the trust boundary made
   * mechanical: an exposed server without a trust decision refuses to
   * start instead of serving an open identity.
   */
  host?: string;
}

/** Root route names a store must not shadow. */
const RESERVED_STORE_NAMES = new Set(["search", "memories", "merge", "stats", "tags", "doctor", "recover"]);

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

/**
 * A bearer-token grant: the trust-boundary unit of increment 4 (decision
 * 8769eee8, step 2 of the gradual internet-facing path 95556ca0). A token
 * IS an agent; one token binds ONE store ('root' names the process store);
 * it is read-only by default — the same rule as auxiliary mounts (5e3bb21f)
 * applied across machines — and raw `where` fragments are local-only unless
 * the token opts in.
 */
export interface TokenGrant {
  /** Display/audit identity of the agent holding the token. */
  agent: string;
  /** The bearer secret. Compared timing-safe (sha256, crypto.timingSafeEqual). */
  token: string;
  /** The granted store: "root" or a declared auxiliary store name. */
  store: string;
  /** "ro" by default; "rw" is the per-token write opt-in. */
  mode: StoreMode;
  /** Whether the token may pass raw `where` fragments (default: no). */
  where: boolean;
}

/**
 * Parses a `--token <agent>=<secret>[@<store>][:rw][:where]` spec. Omitting
 * `@<store>` grants the process store ("root"). Modifiers may appear in any
 * order and are stripped iteratively; secrets cannot contain ':' or '@' so
 * the split is unambiguous. Secrets must be at least 16 chars (openssl
 * rand -hex 32 generates 64) — a weak secret would undermine the boundary.
 */
export function parseTokenSpec(spec: string): TokenGrant {
  const eq = spec.indexOf("=");
  if (eq < 1) {
    throw new Error(`--token expects <agent>=<secret>[@<store>][:rw][:where], got: ${spec}`);
  }
  const agent = spec.slice(0, eq);
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(agent)) {
    throw new Error(
      `invalid agent name '${agent}': lowercase letters, digits and hyphens, starting with a letter`,
    );
  }
  let rest = spec.slice(eq + 1);
  let mode: StoreMode = "ro";
  let where = false;
  for (;;) {
    if (rest.endsWith(":rw")) {
      mode = "rw";
      rest = rest.slice(0, -3);
    } else if (rest.endsWith(":where")) {
      where = true;
      rest = rest.slice(0, -6);
    } else {
      break;
    }
  }
  let store = "root";
  const at = rest.indexOf("@");
  if (at >= 0) {
    store = rest.slice(at + 1);
    rest = rest.slice(0, at);
    if (store.length === 0) {
      throw new Error(`--token '${agent}': '@' requires a store name ('root' for the process store)`);
    }
  }
  if (store !== "root" && !/^[a-z][a-z0-9-]{0,31}$/.test(store)) {
    throw new Error(
      `invalid grant store '${store}': 'root' or a store name (lowercase letters, digits and hyphens, starting with a letter)`,
    );
  }
  if (!/^[A-Za-z0-9_-]{16,}$/.test(rest)) {
    throw new Error(
      `--token '${agent}': the secret needs at least 16 chars of [A-Za-z0-9_-] (no '@' or ':' — they are delimiters); generate one with: openssl rand -hex 32`,
    );
  }
  return { agent, token: rest, store, mode, where };
}

/**
 * Parses a token file — an env-style (dotenv) text file handed to
 * `--token-file <path>` (decision 4429801d). One grant per line as
 * `MEMORY_TOKEN_<agent>=<secret>[@<store>][:rw][:where]`: the agent lives in
 * the KEY (hyphens written as underscores — injective, agent names never
 * contain underscores — so the file stays a valid dotenv file an operator
 * can export), the VALUE is exactly the grammar parseTokenSpec expects after
 * `<agent>=`. Blank lines and full-line `#` comments are skipped; an
 * optional `export ` prefix is accepted; one pair of surrounding quotes is
 * stripped; no interpolation, no escape sequences (hex secrets need none).
 *
 * Strictness is the refuse-don't-hide principle: unknown keys, duplicate
 * agents, zero entries, a missing file — each refuses with a line-numbered
 * error rather than silently weakening the trust boundary (a typo'd key must
 * never look like "no tokens granted"). On POSIX the file must be
 * owner-only (mode & 0o077 === 0) — bearer secrets in a group/world-readable
 * file void the boundary the same way an exposed unauthenticated bind does;
 * the check is skipped on win32, where stat mode bits are unreliable.
 */
export function parseTokenFile(path: string): TokenGrant[] {
  let mode = -1;
  try {
    mode = statSync(path).mode;
  } catch {
    throw new Error(`token file not found: ${path}`);
  }
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    throw new Error(
      `token file '${path}' is readable by group/others (mode 0${(mode & 0o777).toString(8)}): chmod 600 ${path} — bearer secrets in a shared-readable file void the boundary`,
    );
  }
  let text = readFileSync(path, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // UTF-8 BOM
  const grants: TokenGrant[] = [];
  const agentLines = new Map<string, number>();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) {
      throw new Error(`token file '${path}' line ${i + 1}: expected KEY=VALUE, got: ${line}`);
    }
    let key = line.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice(7).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      (value.startsWith('"') || value.startsWith("'")) &&
      value.endsWith(value[0])
    ) {
      value = value.slice(1, -1);
    }
    if (!key.startsWith("MEMORY_TOKEN_")) {
      throw new Error(
        `token file '${path}' line ${i + 1}: unexpected key '${key}' — only MEMORY_TOKEN_<agent> entries belong in a token file`,
      );
    }
    const agent = key.slice("MEMORY_TOKEN_".length).replaceAll("_", "-");
    if (agentLines.has(agent)) {
      throw new Error(
        `token file '${path}' line ${i + 1}: duplicate agent '${agent}' (already granted on line ${agentLines.get(agent)}) — one entry per agent`,
      );
    }
    let grant: TokenGrant;
    try {
      grant = parseTokenSpec(`${agent}=${value}`);
    } catch (err) {
      throw new Error(`token file '${path}' line ${i + 1}: ${err instanceof Error ? err.message : err}`);
    }
    grants.push(grant);
    agentLines.set(agent, i + 1);
  }
  if (grants.length === 0) {
    throw new Error(`token file '${path}': no MEMORY_TOKEN_<agent> entries — the file granted nothing, refusing to start on it`);
  }
  return grants;
}

/** Hosts that bind the loopback interface only — the local trust zone. */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/**
 * The addresses a non-loopback bind actually exposes, for the startup
 * printout (step 3 ergonomics: the operator hands the exact URL to a
 * remote agent and sees the exposure surface before any client connects).
 * A loopback bind exposes nothing ([]); a specific address is itself;
 * 0.0.0.0 resolves to every non-internal IPv4, :: to every non-internal
 * IPv4+IPv6 (link-local fe80 addresses with a scope id are on-link noise,
 * not real exposure). `interfaces` is injectable for tests.
 */
export function exposedAddresses(
  host: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  if (isLoopbackHost(host)) return [];
  if (host !== "0.0.0.0" && host !== "::") return [host];
  const all = host === "::";
  const out = new Set<string>();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (info.internal) continue;
      if (!all && info.family !== "IPv4") continue;
      if ((info.scopeid ?? 0) > 0) continue; // link-local: not a real exposure
      out.add(info.address);
    }
  }
  return [...out];
}

/** Escapes a value into a single-quoted SQLite string literal. */
function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * Reads the `where` query param plus the structured `kind`/`tag` filters and
 * compiles ONE where fragment. kind/tag are the remote-safe alternative to
 * raw fragments (95556ca0 step 2): the server compiles them itself, nothing
 * user-authored reaches the SQL except the escaped literal. Passing both a
 * raw `where` and structured filters is rejected in every mode — one query,
 * one style. Semantics of repeats: `kind` is a scalar field, so repeated
 * values OR together (ANDing them could never match); `tag` is array
 * membership, so repeated values AND (the memory must hold every requested
 * tag); across fields everything ANDs.
 */
export function whereFragment(c: Context): string | undefined {
  const where = c.req.query("where");
  const kinds = c.req.queries("kind") ?? [];
  const tags = c.req.queries("tag") ?? [];
  if (where !== undefined && (kinds.length > 0 || tags.length > 0)) {
    throw new HttpError(400, "pass either 'where' or the structured 'kind'/'tag' params, not both");
  }
  const parts: string[] = [];
  if (where !== undefined) parts.push(where);
  if (kinds.length > 0) {
    const kindClauses = kinds.map((k) => `metadata->>'$.kind' = ${sqlString(k)}`);
    parts.push(`(${kindClauses.join(" OR ")})`);
  }
  for (const t of tags) {
    parts.push(
      `EXISTS (SELECT 1 FROM json_each(metadata->'$.tags') je WHERE json_type(metadata->'$.tags') = 'array' AND je.value = ${sqlString(t)})`,
    );
  }
  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

/**
 * Reads the JSON body under the byte cap (step 3, 95556ca0). Two checks:
 * the declared Content-Length is rejected up front (cheap, no read), and
 * the streamed read enforces the same budget — a lying or chunked body
 * without content-length cannot slide past the cap. Oversized -> 413.
 */
async function readCappedText(c: Context): Promise<string> {
  const declared = c.req.header("content-length");
  if (declared !== undefined) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      throw new HttpError(413, `request body exceeds the ${MAX_BODY_BYTES}-byte cap (content-length: ${declared})`);
    }
  }
  const body = c.req.raw.body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, `request body exceeds the ${MAX_BODY_BYTES}-byte cap`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const chunk of chunks) {
    buf.set(chunk, off);
    off += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/** Parses the JSON body; an empty body is `{}` (e.g. POST /doctor). */
async function readJson(c: Context): Promise<Record<string, unknown>> {
  const raw = await readCappedText(c);
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

/** Parses a non-negative integer query param — floats and negatives are 400.
 *  The lib binds limit/offset straight into SQL, and SQLite reads LIMIT -1
 *  as UNLIMITED: the server must refuse them or ?limit=-1 dumps the store. */
function intQuery(q: string | undefined, name: string): number | undefined {
  if (q === undefined) return undefined;
  if (!/^\d+$/.test(q)) {
    throw new HttpError(400, `${name} must be a non-negative integer, got: ${q}`);
  }
  return Number(q);
}

/** `?limit=` with the MAX_LIMIT cap (step 3): bulk reads over HTTP are not a
 *  thing — pagination walks limit+offset, bulk export stays a CLI verb. */
function cappedLimitQuery(q: string | undefined, name: string): number | undefined {
  const n = intQuery(q, name);
  if (n !== undefined && n > MAX_LIMIT) {
    throw new HttpError(
      400,
      `${name} exceeds the ${MAX_LIMIT} cap — paginate with offset, or export the store with the CLI's export verb`,
    );
  }
  return n;
}

/** Query-string booleans: bare presence, "1" or "true" means on — mirrors the
 * CLI's boolean flags (--all, --force, --resolved); anything else is off. */
function boolQuery(q: string | undefined): boolean {
  return q === "" || q === "1" || q === "true";
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
  { method: "GET", path: "/recover", note: "recovery ritual: {directives, summaries, objectives, stats}, ?directives&summaries&objectives limits" },
  { method: "POST", path: "/memories", note: "store {content, metadata?, weight?} -> 201 {id}" },
  { method: "GET", path: "/memories", note: "list ?where|kind&tag&limit&offset&min-weight&all" },
  { method: "GET", path: "/memories/:id", note: "get (bumps access_count)" },
  { method: "PATCH", path: "/memories/:id", note: "update {metadata?, weight?}" },
  { method: "DELETE", path: "/memories/:id", note: "hard delete, requires ?force=1 (prefer deprecate)" },
  { method: "POST", path: "/memories/:id/supersede", note: "supersede {content, metadata?, weight?} -> 201 {id}" },
  { method: "POST", path: "/memories/:id/deprecate", note: "soft-delete" },
  { method: "POST", path: "/memories/:id/link", note: "link {to, kind, metadata?} -> 201" },
  { method: "GET", path: "/memories/:id/relations", note: "relations ?direction=in|out|both&resolve=1" },
  { method: "POST", path: "/merge", note: "merge {ids, content, metadata?, weight?} -> 201 {id}" },
  { method: "GET", path: "/search", note: "search ?q&where|kind&tag&limit&all" },
  { method: "GET", path: "/stats", note: "store statistics" },
  { method: "GET", path: "/tags", note: "tags ?where|kind&tag&all" },
  { method: "GET", path: "/doctor", note: "integrity report" },
  { method: "POST", path: "/doctor", note: "integrity report, {fix:true} rebuilds the FTS index" },
];

type StoreResolver = () => Store;

/**
 * Middleware rejecting every write on a read-only store. POST /doctor
 * {fix:true} rebuilds the FTS index — a write — so it is blocked too.
 */
function readOnlyGuard(name: string) {
  return async (c: MemoryContext, next: Next) => {
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
function registerStoreRoutes(app: MemoryApp, prefix: string, resolve: StoreResolver, roName?: string): void {
  if (roName !== undefined) {
    app.use(`${prefix}/*`, readOnlyGuard(roName));
  }

  // GET /recover — the recovery ritual as one resource (decision b79c09d4):
  // directives + latest summaries + open objectives + store stats, composed
  // of the SAME list() calls the CLI ritual runs (active memories, the
  // ritual JSON1 kinds, created_at DESC), so HTTP and CLI recovery hands
  // return the same set. Objectives carry the standing register (decision
  // 635132ea): open commitments are PRESENTED every recovery, not left to
  // be found — search rank rewards engagement, standing intent is the
  // least engaging class in the store.
  // GET-only: served by read-only stores too — the ritual for agents whose
  // only access to a store is the HTTP surface. The stats block sizes the
  // store at orientation time (the clear/continue judgment needs it).
  app.get(`${prefix}/recover`, (c) => {
    const store = resolve();
    return c.json({
      directives: store.list({
        where: "metadata->>'$.kind' = 'directive'",
        limit: cappedLimitQuery(c.req.query("directives"), "directives") ?? 20,
      }),
      summaries: store.list({
        where: "metadata->>'$.kind' = 'summary'",
        limit: cappedLimitQuery(c.req.query("summaries"), "summaries") ?? 3,
      }),
      objectives: store.list({
        where: "metadata->>'$.kind' = 'objective' AND metadata->>'$.state' = 'open'",
        limit: cappedLimitQuery(c.req.query("objectives"), "objectives") ?? 10,
      }),
      stats: store.stats(),
    });
  });

  app.post(`${prefix}/memories`, async (c) => {
    const body = await readJson(c);
    const id = resolve().store(requireContent(body["content"]), storeOptions(body));
    return c.json({ id }, 201);
  });

  app.get(`${prefix}/memories`, (c) => {
    const limit = cappedLimitQuery(c.req.query("limit"), "limit");
    const offset = intQuery(c.req.query("offset"), "offset");
    const minWeight = numQuery(c.req.query("min-weight"), "min-weight");
    return c.json(
      resolve().list({
        where: whereFragment(c),
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
      throw new HttpError(400, "update requires at least one of metadata or weight");
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
    const limit = cappedLimitQuery(c.req.query("limit"), "limit");
    return c.json(
      resolve().search(q, {
        where: whereFragment(c),
        ...(limit !== undefined ? { limit } : {}),
        includeLegacy: boolQuery(c.req.query("all")),
      }),
    );
  });

  app.get(`${prefix}/stats`, (c) => c.json(resolve().stats()));

  app.get(`${prefix}/tags`, (c) =>
    c.json(
      resolve().tags({
        where: whereFragment(c),
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
 * Builds the app: root routes over the process's own store, plus each
 * declared auxiliary store mounted at /<name>/... Auxiliary stores open
 * lazily via `openStore` and duplicate names fail fast at construction.
 *
 * Trust model (increment 4, decision 8769eee8):
 * - No tokens declared (local mode): today's behavior — root routes are
 *   read-write (the store IS the agent's identity), auxiliary mounts are
 *   read-only unless declared :rw. Binding a non-loopback host in this mode
 *   refuses to start: an exposed server must have made a trust decision.
 * - Tokens declared (token mode): every request presents `Authorization:
 *   Bearer <secret>` (401 otherwise). The token's grant scopes it to ONE
 *   store (403 elsewhere, 'root' = the process store); writes need the
 *   token's :rw opt-in (409); raw `where` fragments need :where (400) — the
 *   structured kind/tag params stay open to every token, they are the
 *   remote-safe path. Store-level :rw mounts are rejected in token mode:
 *   write access is decided per token, not per mount.
 */
export function createApp(store: Store, opts: MultiStoreOptions = {}): MemoryApp {
  const declared = opts.stores ?? [];
  const seen = new Set<string>();
  for (const d of declared) {
    if (seen.has(d.name)) throw new Error(`duplicate store name: ${d.name}`);
    if (d.name === "root") {
      throw new Error("store name 'root' is reserved: token grants use 'root' to name the process store");
    }
    seen.add(d.name);
  }

  const tokens = opts.tokens ?? [];
  const tokenMode = tokens.length > 0;
  const host = opts.host ?? DEFAULT_HOST;
  const grants = new Map<string, TokenGrant>();
  for (const g of tokens) {
    if (grants.has(g.token)) {
      throw new Error(`duplicate token secret (agent '${g.agent}' collides with '${grants.get(g.token)!.agent}')`);
    }
    if (g.store !== "root" && !seen.has(g.store)) {
      throw new Error(`token '${g.agent}' grants unknown store '${g.store}' (declared: ${[...seen].join(", ") || "none"})`);
    }
    grants.set(g.token, g);
  }
  if (!isLoopbackHost(host) && !tokenMode) {
    throw new Error(
      `host '${host}' is not loopback: declare --token grants or bind 127.0.0.1/::1/localhost — an exposed server without a trust decision is an open identity`,
    );
  }
  if (tokenMode) {
    for (const d of declared) {
      if (d.mode === "rw") {
        throw new Error(
          `store '${d.name}' declared :rw is not honored in token mode: grant write access per token with --token <agent>=<secret>@${d.name}:rw`,
        );
      }
    }
  }

  // Timing-safe bearer authentication (sha256 then constant-time compare —
  // the hash equalizes lengths so timingSafeEqual never throws).
  const sha256 = (v: string) => createHash("sha256").update(v).digest();
  function authenticate(header: string | undefined): TokenGrant {
    const m = header !== undefined ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (m === null) {
      throw new HttpError(401, "authentication required: an Authorization: Bearer <token> header");
    }
    const presented = sha256(m[1]);
    for (const [secret, g] of grants) {
      if (timingSafeEqual(presented, sha256(secret))) return g;
    }
    throw new HttpError(401, "unknown token: check the Authorization header against the declared --token grants");
  }

  const app = new Hono<MemoryEnv>();

  if (tokenMode) {
    app.use("*", async (c, next) => {
      const grant = authenticate(c.req.header("authorization"));
      c.set("tokenGrant", grant);
      if (c.req.path !== "/") {
        const seg = c.req.path.split("/")[1] ?? "";
        const target = seen.has(seg) ? seg : "root";
        if (grant.store !== target) {
          throw new HttpError(
            403,
            `token '${grant.agent}' is granted store '${grant.store}', not '${target}'`,
          );
        }
        if (c.req.method !== "GET" && grant.mode !== "rw") {
          throw new HttpError(
            409,
            `token '${grant.agent}' is read-only on store '${target}'; opt in with :rw at token declaration`,
          );
        }
      }
      if (!grant.where && c.req.query("where") !== undefined) {
        throw new HttpError(
          400,
          "raw 'where' fragments are local-only: use the structured kind/tag params, or opt in with :where at token declaration",
        );
      }
      await next();
    });
  }  app.get("/", (c) => {
    const grant = tokenMode ? c.get("tokenGrant") : undefined;
    if (grant !== undefined) {
      return c.json({
        name: "ai-memory",
        endpoints: ENDPOINTS,
        stores: [{ name: grant.store, mode: grant.mode }],
        note: `token '${grant.agent}' grants store '${grant.store}' in mode '${grant.mode}'${grant.where ? " with raw where" : ""}; routes mirror the CLI verbs`,
      });
    }
    return c.json({
      name: "ai-memory",
      endpoints: ENDPOINTS,
      ...(declared.length > 0
        ? {
            stores: declared.map(({ name, dbPath, mode }) => ({ name, db: dbPath, mode })),
            note: "auxiliary stores mount at /<name>/...; they are read-only unless declared with mode 'rw'",
          }
        : {}),
    });
  });

  // Root: the process's own store (one agent = one store, decision a4950b47).
  registerStoreRoutes(app, "", () => store);

  // Auxiliary stores: opened lazily on first request; the openStore seam lets
  // the caller (bin) own their lifecycle and close them after shutdown. In
  // token mode the mount-level ro guard is NOT mounted — write access is
  // governed per token by the auth middleware (a store-level :rw declaration
  // is even rejected); in local mode the ro guard keeps enforcing isolation.
  // In local mode a ro-declared mount ALSO opens the store itself read-only
  // at the lib level (decision 675f18a8): the middleware is the HTTP face
  // with the hint, the lib guard is the floor.
  const openStore = opts.openStore ?? ((dbPath: string, readOnly: boolean) => Store.open({ dbPath, readOnly }));
  const opened = new Map<string, Store>();
  for (const d of declared) {
    const resolve = (): Store => {
      let s = opened.get(d.name);
      if (!s) {
        s = openStore(d.dbPath, !tokenMode && d.mode === "ro");
        opened.set(d.name, s);
      }
      return s;
    };
    registerStoreRoutes(app, `/${d.name}`, resolve, !tokenMode && d.mode === "ro" ? d.name : undefined);
  }

  app.notFound((c) => c.json({ error: "not found" }, 404));

  app.onError((err, c) => c.json({ error: err.message }, statusFor(err)));

  return app;
}
