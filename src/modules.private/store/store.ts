import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrate, SCHEMA_VERSION, schemaVersion } from './migration/migration.ts';

export type UUID = string;

export type MemoryStatus = 'active' | 'superseded' | 'deprecated' | 'merged';

/**
 * The condensation ceiling: a memory longer than this owes its summary at
 * write time, and no summary may exceed it either. Characters, not bytes —
 * ~100 tokens, so a recover serving twenty hot memories costs ~2K tokens
 * of content while the full text stays one `get` away. Fixed by the store,
 * not configurable — the contract is the contract.
 */
export const MAX_SUMMARY_LENGTH = 400;

/**
 * One record in a store: content, its authored summary (the condensation
 * that lets recover and search serve more memories per call — owed when
 * the content runs past the ceiling), metadata, a status, and the hot
 * flag — the curation mark that hands the memory to the recover ritual
 * (#12). `hot` is earned after the fact (setHot), never at birth, and
 * survives only on an active memory.
 */
export interface Memory {
  readonly id: UUID;
  readonly content: string;
  readonly summary: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
  readonly status: MemoryStatus;
  readonly hot: boolean;
}

/**
 * A directed edge between two memories (from → to, with a kind). The graph
 * is the single relation surface; reading surfaces project it (#12).
 */
export interface Relation {
  readonly from_id: UUID;
  readonly to_id: UUID;
  readonly kind: string;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
}

/**
 * One outgoing edge authored in the same gesture as the memory itself —
 * the one-gesture write that retires the prose-citation practice. The
 * `link` verb stays for arbitrary edges: reverse directions, retro-fixes,
 * cross-memory repairs.
 */
export interface RelationSpec {
  readonly to: UUID;
  readonly kind: string;
}

export interface StoreOptions {
  readonly metadata?: Record<string, unknown>;
  /**
   * The authored condensation of the content — owed when the content runs
   * past `MAX_SUMMARY_LENGTH`, refused when it exceeds the ceiling itself.
   * Written here and never after: revising a summary is a supersede.
   */
  readonly summary?: string;
  /**
   * Outgoing edges created in the same call (store: to the new memory;
   * supersede: to the NEW memory — the old→new supersedes edge still
   * happens). Per-edge validation identical to link.
   */
  readonly relations?: readonly RelationSpec[];
}

/** merge's own options — it bridges its sources (the `merges` edges come
 *  from the fusion itself), so the one-gesture `relations` of
 *  StoreOptions has no meaning here. */
export interface MergeOptions {
  readonly metadata?: Record<string, unknown>;
  readonly summary?: string;
}

export interface LinkOptions {
  readonly metadata?: Record<string, unknown>;
}

export interface OpenOptions {
  /**
   * Where the store lives. Required — the path is policy (config, manager),
   * never a silent default the library guesses.
   */
  readonly dbPath: string;
  /**
   * Open for reading only: a missing file is refused (nothing is created),
   * migration is skipped (an out-of-date store is refused — open it
   * read-write once to migrate), and every write verb throws.
   */
  readonly readOnly?: boolean;
}

/**
 * The graph projection of one memory: the shape every node-returning read
 * (get, list, search, recover) serves. Out-edges expand into target nodes
 * when depth asks for it; in-edges always stay raw rows — *out expands,
 * in informs*. Both directions carry the edges' `created_at DESC` order.
 */
export interface RelationsBlock {
  readonly out: readonly OutEdge[];
  readonly in: readonly Relation[];
}

/**
 * One outgoing edge of the projection. `target` carries the recursively
 * expanded node and is null when the projection stops there: the depth is
 * exhausted, the target was already expanded once in this projection (the
 * visited set renders cycles and diamonds as leaves), or the edge names a
 * missing memory in a hand-corrupted store (the doctor, #13, reports it).
 */
export interface OutEdge extends Relation {
  readonly target: MemoryWithRelations | null;
}

/**
 * One memory plus its graph projection — the node of the read surface.
 * `Memory` stays the stored truth the write verbs land; this is what
 * serving looks like.
 */
export interface MemoryWithRelations extends Memory {
  readonly relations: RelationsBlock;
}

/**
 * A search hit: the projected node plus its FTS5 relevance score. Pure
 * bm25 — smaller wins, best match first; no weight, recency or access
 * terms remain.
 */
export interface SearchResult extends MemoryWithRelations {
  readonly rank: number;
}

export interface GetOptions {
  /**
   * How deep out-edges expand. Integer >= 1, default 1 (raw edges), no
   * upper bound — the visited set guards cycles, the caller owns the pace.
   */
  readonly depth?: number;
}

export interface ListOptions {
  readonly limit?: number;
  readonly offset?: number;
  /**
   * Include superseded/deprecated/merged memories — the --all surface
   * (active-only by default).
   */
  readonly includeLegacy?: boolean;
  /**
   * A raw SQL condition on the memories row (`metadata->>'$.kind' = 'note'`
   * and friends) — the grant opt-in that the server surface gates.
   */
  readonly where?: string;
}

export interface SearchOptions {
  readonly limit?: number;
  readonly includeLegacy?: boolean;
  readonly where?: string;
}

export interface RecoverOptions {
  /**
   * The hot block's cap. Absent: no cap — recover serves the whole set;
   * order guides attention, nothing drops.
   */
  readonly limit?: number;
}

export interface Stats {
  readonly memories: number;
  readonly hot_memories: number;
  readonly memories_by_status: Readonly<Record<string, number>>;
  readonly memories_by_kind: Readonly<Record<string, number>>;
  readonly edges: number;
  readonly edges_by_kind: Readonly<Record<string, number>>;
}

/**
 * The recovery ritual's report: the curated hot block plus the store's
 * shape. The block an agent's fresh session reads in one call.
 */
export interface RecoverReport {
  /** Active + hot memories, newest first, relations included. */
  readonly hot: readonly MemoryWithRelations[];
  readonly stats: Stats;
}

/**
 * Tightens a store file and its WAL sidecars to owner-only permissions.
 * The store IS the agent's identity (directives, decisions, transcripts) —
 * the same argument that makes a group-readable token file a refusal
 * applies to the store file. Best-effort: a failed chmod never bricks the
 * open; the doctor's file_permissions check is the visible enforcer for
 * anything this pass cannot reach (win32 skipped — stat mode is unreliable).
 */
function tightenPermissions(dbPath: string): void {
  if (process.platform === 'win32') return;
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (existsSync(path)) chmodSync(path, 0o600);
    } catch {
      // best effort — the doctor reports drift
    }
  }
}

/** The busy handler both open paths share, in milliseconds. */
const BUSY_TIMEOUT_MS = 5000;

/**
 * The pragmas both open paths share: the busy handler and FK enforcement.
 * The read-only open stops here — the store is served as its owner left
 * it, and no journal_mode may switch under it.
 */
function execSharedPragmas(db: DatabaseSync): void {
  // busy_timeout MUST come first: PRAGMA journal_mode = WAL grabs an exclusive
  // file-header lock when the store is fresh (or unwal'd). With the busy handler
  // unset, any racing open loses that grab immediately with SQLITE_BUSY.
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec('PRAGMA foreign_keys = ON');
}

function execPragma(db: DatabaseSync): void {
  execSharedPragmas(db);
  db.exec('PRAGMA journal_mode = WAL');
}

const SQLITE_BUSY = 5;
const BUSY_RETRIES = 50;
const BUSY_DELAY_MS = 20;

/**
 * Raw shape of one memories row — parsed into `Memory` by `parseMemoryRow`.
 */
interface MemoryRow {
  readonly id: string;
  readonly content: string;
  readonly summary: string | null;
  readonly metadata: string | null;
  readonly created_at: string;
  readonly status: string;
  readonly hot: number;
}

/**
 * Raw shape of one edges row — parsed into `Relation` by `parseRelationRow`.
 */
interface RelationRow {
  readonly from_id: string;
  readonly to_id: string;
  readonly kind: string;
  readonly metadata: string | null;
  readonly created_at: string;
}

function parseRawMetadata(metadata: string | null): Record<string, unknown> | null {
  if (metadata === null) return null;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseMemoryRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    summary: row.summary,
    metadata: parseRawMetadata(row.metadata),
    created_at: row.created_at,
    status: row.status as MemoryStatus,
    hot: row.hot === 1,
  };
}

function parseRelationRow(row: RelationRow): Relation {
  return {
    from_id: row.from_id,
    to_id: row.to_id,
    kind: row.kind,
    metadata: parseRawMetadata(row.metadata),
    created_at: row.created_at,
  };
}

/**
 * Depth validation for `get`: absent means 1 (raw edges), anything else
 * must be an integer >= 1. No upper bound — the visited set guards cycles,
 * the caller owns the pace.
 */
function normaliseDepth(depth: number | undefined): number {
  if (depth === undefined) return 1;
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error('depth must be an integer >= 1');
  }
  return depth;
}

/**
 * Limit validation shared by list/search/recover: absent means the verb's
 * own default (recover: no cap), anything else must be an integer >= 1.
 */
function normaliseLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be an integer >= 1');
  }
  return limit;
}

function normaliseOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('offset must be an integer >= 0');
  }
  return offset;
}

/**
 * Decides whether a search failure came from malformed FTS5 query glue
 * (punctuation inside bare tokens) rather than from a plain SQL problem.
 * FTS5 signals it in two ways: a "fts5: syntax error" from characters it
 * cannot parse, or "no such column: X" when a hyphenated/colonated
 * compound makes it read X as a column filter — only trusted when X
 * appears in the query itself.
 */
function ftsErrorFromQuery(err: unknown, query: string): boolean {
  if (!(err instanceof Error)) return false;
  if (/fts5:\s*syntax error/i.test(err.message)) return true;
  const match = err.message.match(/no such column:\s*"([^"]+)"|no such column:\s*([A-Za-z0-9_]+)/i);
  if (!match) return false;
  const name = (match[1] ?? match[2]).toLowerCase();
  return query.toLowerCase().includes(name);
}

/**
 * Fallback query builder for FTS5 syntax failures. Keeps operators and
 * quoted phrases, strips every other punctuation character so dotted
 * numerics and hyphenated/colonated identifiers become plain tokens
 * ("better-sqlite3" -> "better sqlite3"). Returns null when nothing
 * searchable remains; the caller then rethrows the original error.
 */
function sanitizeFtsQuery(query: string): string | null {
  const parts = query.match(/"[^"]*"|[^\s"]+/g);
  if (!parts) return null;
  const cleaned: string[] = [];
  for (const part of parts) {
    if (part.startsWith('"')) {
      const inner = part
        .slice(1, -1)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (inner) cleaned.push(`"${inner}"`);
      continue;
    }
    if (/^(OR|AND|NOT)$/i.test(part)) {
      cleaned.push(part.toUpperCase());
      continue;
    }
    const pieces = part.replace(/[^\p{L}\p{N}]/gu, ' ').split(/\s+/);
    for (const piece of pieces) {
      if (piece) cleaned.push(piece);
    }
  }
  return cleaned.length > 0 ? cleaned.join(' ') : null;
}

export class Store {
  readonly db: DatabaseSync;
  readonly dbPath: string;
  /** True when opened with readOnly — write verbs refuse, migration is
   *  skipped. */
  readonly readOnly: boolean;

  // The one `private` the code style allows: `#` cannot prefix a
  // constructor, and hiding it is what makes `open` the only way in.
  private constructor(db: DatabaseSync, dbPath: string, readOnly: boolean) {
    this.db = db;
    this.dbPath = dbPath;
    this.readOnly = readOnly;
  }

  static open(options: OpenOptions): Store {
    const dbPath = resolve(options.dbPath);
    if (options.readOnly === true) {
      // A read-only open creates nothing and migrates nothing: the store is
      // served exactly as its owner left it, and refused if it is missing
      // or speaks an older schema than this library.
      if (!existsSync(dbPath)) {
        throw new Error(`no store at ${dbPath}`);
      }
      const db = new DatabaseSync(dbPath, { readOnly: true });
      execSharedPragmas(db);
      const version = schemaVersion(db);
      if (version < SCHEMA_VERSION) {
        throw new Error(
          `store at ${dbPath} is at schema version ${version}` +
            ` (the library expects ${SCHEMA_VERSION});` +
            ` open it read-write once to migrate`,
        );
      }
      return new Store(db, dbPath, true);
    }
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    execPragma(db);
    migrate(db);
    tightenPermissions(dbPath);
    return new Store(db, dbPath, false);
  }

  /**
   * Write verbs refuse on a read-only store. NOT enforced inside
   * #withBusyRetry(): it also carries legitimate non-write uses (the
   * doctor's VACUUM INTO snapshot lands there in #13).
   */
  #assertWritable(): void {
    if (this.readOnly) {
      throw new Error('store is read-only (opened with readOnly: true); writes are refused');
    }
  }

  /**
   * The write verbs' shared pre-check: refuse an unknown id by name, then
   * refuse any non-active status — supersede/merge/deprecate only ever
   * touch the living. Returns the memory's hot flag: supersede transfers
   * it to the head, merge unions it across sources.
   */
  #requireActive(id: string, verb: string): boolean {
    const row = this.db.prepare('SELECT status, hot FROM memories WHERE id = ?').get(id) as
      { status: MemoryStatus; hot: number } | undefined;
    if (!row) throw new Error(`memory not found: ${id}`);
    if (row.status !== 'active') {
      throw new Error(`cannot ${verb} a memory with status '${row.status}'`);
    }
    return row.hot === 1;
  }

  /**
   * Run a multi-statement write as ONE transaction, under the BUSY retry:
   * a fresh BEGIN each attempt, COMMIT on success, ROLLBACK + rethrow
   * otherwise. Every check-then-write verb goes through here — the check
   * and the write land atomically, so exactly one concurrent winner
   * exists.
   */
  #transaction<GOutput>(operation: () => GOutput): GOutput {
    return this.#withBusyRetry(() => {
      this.db.exec('BEGIN');
      try {
        const result = operation();
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    });
  }

  /**
   * The summary contract: a memory running past the ceiling owes its
   * authored condensation, and no condensation may exceed the ceiling
   * itself — a summary longer than the limit is not a condensation.
   * Enforced at write time only: migrated rows keep their long content
   * and their null summary (the obligation starts with the refonte).
   */
  #checkSummary(content: string, summary: string | null): void {
    if (content.length > MAX_SUMMARY_LENGTH && !summary) {
      throw new Error(
        `content exceeds ${MAX_SUMMARY_LENGTH} characters; provide a summary condensing it`,
      );
    }
    if (summary && summary.length > MAX_SUMMARY_LENGTH) {
      throw new Error(`summary exceeds ${MAX_SUMMARY_LENGTH} characters; condense it further`);
    }
  }

  /**
   * Store a memory: UUID id, metadata JSON, born cold — the hot flag is
   * earned after the fact (setHot), never at birth. The one-gesture
   * relations land in the same transaction: the memory and its edges
   * arrive together or not at all.
   */
  store(content: string, options: StoreOptions = {}): string {
    this.#assertWritable();
    if (!content) throw new Error('content must be non-empty');
    this.#checkSummary(content, options.summary ?? null);
    const id = randomUUID();
    const summary = options.summary ?? null;
    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
    const created_at = new Date().toISOString();
    this.#transaction(() => {
      this.db
        .prepare(
          'INSERT INTO memories (id, content, summary, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, content, summary, metadata, created_at);
      if (options.relations?.length) {
        this.#insertRelations(id, options.relations, created_at);
      }
    });
    return id;
  }

  /**
   * Revise a memory: the successor carries the content, the structural
   * metadata (kind when every source agrees, tags unioned) and — when no
   * explicit relations are given — the source's outgoing edges VERBATIM
   * (kind, metadata, created_at copied row by row). A revision corrects
   * CONTENT, not the relation set; the old memory keeps its edges as
   * provenance (addition-only, nothing moves). Explicit relations win over
   * inheritance, the same way explicit metadata overrides structural
   * inheritance. The supersedes bridge lands old→new, the old memory is
   * marked superseded, and its hot flag TRANSFERS to the head — the
   * revision replaces what recover would have served.
   */
  supersede(oldId: string, content: string, options: StoreOptions = {}): string {
    this.#assertWritable();
    if (!content) throw new Error('content must be non-empty');
    this.#checkSummary(content, options.summary ?? null);
    const newId = randomUUID();
    const created_at = new Date().toISOString();
    this.#transaction(() => {
      const hot = this.#requireActive(oldId, 'supersede');
      const inherited = options.metadata ?? this.#structuralInherit([this.#readMeta(oldId)]);
      const metadata = inherited ? JSON.stringify(inherited) : null;
      this.db
        .prepare(
          'INSERT INTO memories (id, content, summary, metadata, created_at, hot) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(newId, content, options.summary ?? null, metadata, created_at, hot ? 1 : 0);
      if (!options.relations?.length) {
        const inheritedEdges = this.db
          .prepare('SELECT to_id, kind, metadata, created_at FROM edges WHERE from_id = ?')
          .all(oldId) as unknown as Array<{
          to_id: string;
          kind: string;
          metadata: string | null;
          created_at: string;
        }>;
        const memoryExists = this.db.prepare('SELECT 1 FROM memories WHERE id = ?');
        for (const edge of inheritedEdges) {
          // Pre-validated like #insertRelations: refuse-don't-hide — a
          // hand-corrupted orphan source edge names its missing target
          // precisely instead of failing an FK message, and the
          // ROLLBACK keeps the old memory active and unbridged.
          if (!memoryExists.get(edge.to_id)) {
            throw new Error(`memory not found: ${edge.to_id}`);
          }
          this.#insertEdge(newId, edge.to_id, edge.kind, edge.metadata, edge.created_at);
        }
      }
      // The one-gesture relations are the NEW memory's outgoing edges —
      // the ritual citation "link it right after storing" dies here.
      if (options.relations?.length) {
        this.#insertRelations(newId, options.relations, created_at);
      }
      this.#insertEdge(oldId, newId, 'supersedes', null, created_at);
      this.db.prepare("UPDATE memories SET status = 'superseded', hot = 0 WHERE id = ?").run(oldId);
    });
    return newId;
  }

  /**
   * Fuse memories: one successor carries the content and the structural
   * metadata (kind only when every source agrees, tags unioned); each
   * source keeps a `merges` bridge as provenance and is marked merged.
   * The hot flag UNIONS across sources — if any source was headed for
   * recover, the fusion is. Sources cool: the flag lives only on active
   * memories.
   */
  merge(ids: readonly string[], content: string, options: MergeOptions = {}): string {
    this.#assertWritable();
    if (ids.length < 2) throw new Error('merge requires at least 2 memories');
    if (!content) throw new Error('content must be non-empty');
    this.#checkSummary(content, options.summary ?? null);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`duplicate id in merge: ${id}`);
      seen.add(id);
    }
    const newId = randomUUID();
    const created_at = new Date().toISOString();
    this.#transaction(() => {
      const metadataList: Array<Record<string, unknown> | null> = [];
      let hot = false;
      for (const id of ids) {
        if (this.#requireActive(id, 'merge')) hot = true;
        metadataList.push(this.#readMeta(id));
      }
      const inherited = options.metadata ?? this.#structuralInherit(metadataList);
      const metadata = inherited ? JSON.stringify(inherited) : null;
      this.db
        .prepare(
          'INSERT INTO memories (id, content, summary, metadata, created_at, hot) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(newId, content, options.summary ?? null, metadata, created_at, hot ? 1 : 0);
      for (const id of ids) {
        this.#insertEdge(id, newId, 'merges', null, created_at);
        this.db.prepare("UPDATE memories SET status = 'merged', hot = 0 WHERE id = ?").run(id);
      }
    });
    return newId;
  }

  /**
   * End a memory deliberately: deprecated stays in the store (history is
   * never rewritten), cools, and refuses any further write gesture. There
   * is no delete — persistent memory obliges. The check and the update
   * share the transaction: under concurrency, exactly one deprecate wins.
   */
  deprecate(id: string): void {
    this.#assertWritable();
    this.#transaction(() => {
      this.#requireActive(id, 'deprecate');
      this.db.prepare("UPDATE memories SET status = 'deprecated', hot = 0 WHERE id = ?").run(id);
    });
  }

  /**
   * The one non-graph mutation: curation. Only an ACTIVE memory can be
   * hot — the flag hands the memory to the recover ritual (#12), and a
   * superseded/deprecated/merged memory must not resurface through it.
   * Status transitions cool the memory; this is the only way back. The
   * check and the write share the transaction: a racing supersede and the
   * curation resolve to exactly one winner.
   */
  setHot(id: string, hot: boolean): void {
    this.#assertWritable();
    this.#transaction(() => {
      const row = this.#readStatus(id);
      if (!row) throw new Error(`memory not found: ${id}`);
      if (row !== 'active') {
        throw new Error(`cannot hot a memory with status '${row}'`);
      }
      this.db.prepare('UPDATE memories SET hot = ? WHERE id = ?').run(hot ? 1 : 0, id);
    });
  }

  /**
   * Create a typed directed edge — the retro-fix, reverse-direction,
   * cross-memory repair gesture (one-gesture writes use StoreOptions
   * relations). Idempotent per (from, to, kind).
   */
  link(fromId: string, toId: string, kind: string, options: LinkOptions = {}): void {
    this.#assertWritable();
    if (!kind) throw new Error('kind must be non-empty');
    const fromExists = this.#withBusyRetry(() =>
      this.db.prepare('SELECT 1 FROM memories WHERE id = ?').get(fromId),
    );
    if (!fromExists) throw new Error(`memory not found: ${fromId}`);
    const toExists = this.#withBusyRetry(() =>
      this.db.prepare('SELECT 1 FROM memories WHERE id = ?').get(toId),
    );
    if (!toExists) throw new Error(`memory not found: ${toId}`);

    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
    const created_at = new Date().toISOString();
    this.#withBusyRetry(() => this.#insertEdge(fromId, toId, kind, metadata, created_at));
  }

  /**
   * Remove one edge — a CORRECTION among the living: both endpoints must
   * be active, which makes the supersedes/merges bridges untouchable by
   * construction (they leave a non-active source). Persistent memory
   * obliges: the graph only grows, except to fix a just-made mistake.
   * The pair (from, to) identifies the edge when it carries a single kind;
   * with several kinds on the same directed pair the removal is refused
   * with the candidate list — refuse, don't hide. kind omitted + edges on
   * the REVERSE pair surfaces them: the transposed-uuid mistake gets a
   * direction hint, not a bare not-found. Removes exactly one edge row —
   * no cascade, no update; a wrong edge is recreated right, never edited.
   */
  unlink(fromId: string, toId: string, kind?: string): void {
    this.#assertWritable();
    // One transaction end to end: the endpoint checks and the deletion are
    // atomic, so a racing deprecate/supersede cannot flip an endpoint's
    // status between the check and the write — the bridges stay
    // untouchable by construction under concurrency, and the candidate
    // list cannot interleave with a racing link.
    this.#transaction(() => {
      // Endpoint existence first: a missing memory can hold no edge, and the
      // transposed-id mistake (the lived failure behind this verb) reads as a
      // precise endpoint error instead of a bare "edge not found".
      const fromStatus = this.#readStatus(fromId);
      if (!fromStatus) throw new Error(`memory not found: ${fromId}`);
      const toStatus = this.#readStatus(toId);
      if (!toStatus) throw new Error(`memory not found: ${toId}`);
      if (fromStatus !== 'active') {
        throw new Error(`cannot unlink a memory with status '${fromStatus}'`);
      }
      if (toStatus !== 'active') {
        throw new Error(`cannot unlink a memory with status '${toStatus}'`);
      }

      if (kind !== undefined) {
        if (!kind) throw new Error('kind must be non-empty');
        const result = this.db
          .prepare('DELETE FROM edges WHERE from_id = ? AND to_id = ? AND kind = ?')
          .run(fromId, toId, kind);
        if (result.changes === 0) {
          throw new Error(`edge not found: ${fromId} -> ${toId} (${kind})`);
        }
        return;
      }

      const directed = this.db
        .prepare('SELECT kind FROM edges WHERE from_id = ? AND to_id = ? ORDER BY kind')
        .all(fromId, toId) as unknown as Array<{ kind: string }>;
      if (directed.length === 1) {
        this.db
          .prepare('DELETE FROM edges WHERE from_id = ? AND to_id = ? AND kind = ?')
          .run(fromId, toId, directed[0]!.kind);
        return;
      }
      if (directed.length === 0) {
        const reverse = this.db
          .prepare('SELECT kind FROM edges WHERE from_id = ? AND to_id = ? ORDER BY kind')
          .all(toId, fromId) as unknown as Array<{ kind: string }>;
        if (reverse.length > 0) {
          const list = reverse.map((edge) => `${toId} -> ${fromId} (${edge.kind})`).join(', ');
          throw new Error(
            `edge not found: ${fromId} -> ${toId}; edges exist in the reverse direction: ${list}`,
          );
        }
        throw new Error(`edge not found: ${fromId} -> ${toId}`);
      }
      const kinds = directed.map((edge) => edge.kind).join(', ');
      throw new Error(
        `ambiguous: ${directed.length} edges between ${fromId} and ${toId}, pass --kind: ${kinds}`,
      );
    });
  }

  // --- reads (#12) : the projection ----------------------------------------

  /**
   * Read one memory with its graph projection. Depth 1 (default) serves
   * raw {out, in} edges; greater depths expand out-edges recursively —
   * *out expands, in informs* — with the visited set rendering cycles and
   * diamonds as leaves. Reads stay reads: nothing is written, signaled or
   * bumped. An unknown id is null, not a throw — absence is an answer.
   */
  get(id: string, options: GetOptions = {}): MemoryWithRelations | null {
    const depth = normaliseDepth(options.depth);
    return this.#expandToNode(id, depth, new Set<string>());
  }

  /**
   * Project one memory as the tree's node: its raw edges plus, per
   * out-edge, the target node when the remaining depth allows and the
   * visited set has not seen it. Expansion marks targets visited in the
   * edges' own order (created_at DESC), so the first occurrence in the
   * projection owns the recursion and later occurrences are leaves.
   */
  #projectNode(memory: Memory, depth: number, visited: Set<string>): MemoryWithRelations {
    visited.add(memory.id);
    const out = this.db
      .prepare(
        'SELECT from_id, to_id, kind, metadata, created_at FROM edges' +
          ' WHERE from_id = ? ORDER BY created_at DESC',
      )
      .all(memory.id) as unknown as RelationRow[];
    const inRows = this.db
      .prepare(
        'SELECT from_id, to_id, kind, metadata, created_at FROM edges' +
          ' WHERE to_id = ? ORDER BY created_at DESC',
      )
      .all(memory.id) as unknown as RelationRow[];
    const relations: RelationsBlock = {
      out: out.map((row) => {
        const relation = parseRelationRow(row);
        let target: MemoryWithRelations | null = null;
        if (depth > 1 && !visited.has(row.to_id)) {
          target = this.#expandToNode(row.to_id, depth - 1, visited);
        }
        return { ...relation, target };
      }),
      in: inRows.map((row) => parseRelationRow(row)),
    };
    return { ...memory, relations };
  }

  /**
   * Fetch and project one node. Null when the id names no memory — the
   * unknown-id contract of `get` and, deeper in a projection, the same
   * null an orphan edge from a hand-corrupted store renders (FK
   * enforcement makes it impossible through this store; the doctor,
   * #13, reports the drift). Never throws on absence.
   */
  #expandToNode(id: string, depth: number, visited: Set<string>): MemoryWithRelations | null {
    const row = this.db
      .prepare(
        'SELECT id, content, summary, metadata, created_at, status, hot FROM memories WHERE id = ?',
      )
      .get(id) as unknown as MemoryRow | undefined;
    if (!row) return null;
    return this.#projectNode(parseMemoryRow(row), depth, visited);
  }

  /**
   * Search memories by FTS5 match, ranked by pure bm25 — search wants to
   * search everywhere: no weight, recency or access terms (the legacy
   * ranking factors died with their columns). Active-only unless
   * includeLegacy, narrowed by the where grant, limit 20 by default.
   * Hits are projected nodes (depth-1 relations included).
   *
   * A failed MATCH is not a refusal: when the failure comes from FTS5
   * glue in the query itself (dotted numerics, hyphenated/colonated
   * identifiers), one sanitized retry runs; operators and quoted phrases
   * are preserved and a query with nothing searchable rethrows the
   * original error.
   */
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!query) throw new Error('query must be non-empty');
    const limit = normaliseLimit(options.limit, 20);
    let sql =
      'SELECT m.id, m.content, m.summary, m.metadata, m.created_at, m.status, m.hot,' +
      ' (bm25(memories_fts)) AS rank' +
      ' FROM memories_fts f JOIN memories m ON m.rowid = f.rowid' +
      ' WHERE memories_fts MATCH ?';
    if (options.includeLegacy !== true) {
      sql += ` AND m.status = 'active'`;
    }
    if (options.where) {
      sql += ` AND ${options.where}`;
    }
    sql += ' ORDER BY rank LIMIT ?';
    const runQuery = (match: string): SearchResult[] => {
      const rows = this.db.prepare(sql).all(match, limit) as unknown as Array<
        MemoryRow & { readonly rank: number }
      >;
      return rows.map((row) => ({
        ...this.#projectNode(parseMemoryRow(row), 1, new Set<string>()),
        rank: row.rank,
      }));
    };
    try {
      return runQuery(query);
    } catch (err) {
      if (ftsErrorFromQuery(err, query)) {
        const sanitized = sanitizeFtsQuery(query);
        if (sanitized) return runQuery(sanitized);
      }
      throw err;
    }
  }

  /**
   * The recovery ritual in one call — the deep-module home the HTTP
   * /recover endpoint and the MCP recover tool will both serve. The hot
   * block replaces the legacy kind blocks: active + hot memories served
   * as projected nodes, relations included (zero drill-in), newest first.
   * No cap by default — the limit opt guides attention without ever
   * dropping anything silently. Reads stay reads.
   */
  recover(options: RecoverOptions = {}): RecoverReport {
    // LIMIT -1 is SQLite's no-cap form: the hot set serves whole.
    const limit = normaliseLimit(options.limit, -1);
    const rows = this.db
      .prepare(
        'SELECT id, content, summary, metadata, created_at, status, hot FROM memories' +
          " WHERE status = 'active' AND hot = 1 ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as unknown as MemoryRow[];
    return {
      hot: rows.map((row) => this.#projectNode(parseMemoryRow(row), 1, new Set<string>())),
      stats: this.stats(),
    };
  }

  /**
   * List memories as projected nodes: newest first, active-only unless
   * includeLegacy, paged by limit/offset, narrowed by the where grant.
   * Every row carries its depth-1 relations block — list is the
   * set-serving verb, and the projection rides free next to the content
   * read.
   */
  list(options: ListOptions = {}): MemoryWithRelations[] {
    const limit = normaliseLimit(options.limit, 20);
    const offset = normaliseOffset(options.offset);
    let sql = 'SELECT id, content, summary, metadata, created_at, status, hot FROM memories';
    const conditions: string[] = [];
    if (options.includeLegacy !== true) {
      conditions.push("status = 'active'");
    }
    if (options.where) {
      conditions.push(options.where);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const rows = this.db.prepare(sql).all(limit, offset) as unknown as MemoryRow[];
    return rows.map((row) => this.#projectNode(parseMemoryRow(row), 1, new Set<string>()));
  }

  /**
   * The store's shape in one aggregate call — counts, not rows. Reads
   * never move these numbers (no access signal): two stats() calls across
   * any reads return the same report. The by-kind ledger groups the
   * metadata path `$.kind` over every status; kind-less memories simply
   * don't appear (kind is a free tag, the refonte keeps it that way).
   */
  stats(): Stats {
    const memories_by_status: Record<string, number> = {};
    const statusRows = this.db
      .prepare('SELECT status, count(*) AS c FROM memories GROUP BY status ORDER BY status')
      .all() as unknown as Array<{ status: string; c: number }>;
    for (const row of statusRows) {
      memories_by_status[row.status] = row.c;
    }
    const memories_by_kind: Record<string, number> = {};
    const kindRows = this.db
      .prepare(
        `SELECT json_extract(metadata, '$.kind') AS kind, count(*) AS c FROM memories
         WHERE metadata IS NOT NULL AND json_extract(metadata, '$.kind') IS NOT NULL
         GROUP BY kind ORDER BY kind`,
      )
      .all() as unknown as Array<{ kind: string; c: number }>;
    for (const row of kindRows) {
      memories_by_kind[row.kind] = row.c;
    }
    const edges_by_kind: Record<string, number> = {};
    const kindEdges = this.db
      .prepare('SELECT kind, count(*) AS c FROM edges GROUP BY kind ORDER BY kind')
      .all() as unknown as Array<{ kind: string; c: number }>;
    for (const row of kindEdges) {
      edges_by_kind[row.kind] = row.c;
    }
    return {
      memories: this.#count('SELECT count(*) AS c FROM memories'),
      hot_memories: this.#count(
        "SELECT count(*) AS c FROM memories WHERE status = 'active' AND hot = 1",
      ),
      memories_by_status,
      memories_by_kind,
      edges: this.#count('SELECT count(*) AS c FROM edges'),
      edges_by_kind,
    };
  }

  /**
   * The single SELECT count(*) row — stats' own arithmetic.
   */
  #count(sql: string): number {
    const row = this.db.prepare(sql).get() as unknown as { c: number };
    return row.c;
  }

  /**
   * The status of one memory, or undefined when absent. BUSY-retried:
   * callers run it outside a transaction (unlink's pre-checks) or inside
   * one where the retry stays a plain read (setHot).
   */
  #readStatus(id: string): MemoryStatus | undefined {
    const row = this.#withBusyRetry(() =>
      this.db.prepare('SELECT status FROM memories WHERE id = ?').get(id),
    ) as { status: MemoryStatus } | undefined;
    return row?.status;
  }

  /**
   * The outgoing edges of a one-gesture write (StoreOptions.relations).
   * Per-edge validation is link's own — kind non-empty, target exists —
   * and the INSERT is #insertEdge — link's statement, shared verbatim. A
   * self-edge is left to land: the doctor's self_edges check is the
   * visible enforcer, the write is not smarter than the graph. Runs
   * INSIDE the caller's transaction, so the memory and its edges land
   * atomically or not at all.
   */
  #insertRelations(fromId: string, relations: readonly RelationSpec[], createdAt: string): void {
    for (const relation of relations) {
      if (!relation.kind) throw new Error('kind must be non-empty');
      if (!relation.to) throw new Error('to must be a memory id');
      const targetExists = this.db.prepare('SELECT 1 FROM memories WHERE id = ?').get(relation.to);
      if (!targetExists) throw new Error(`memory not found: ${relation.to}`);
    }
    for (const relation of relations) {
      this.#insertEdge(fromId, relation.to, relation.kind, null, createdAt);
    }
  }

  /**
   * The one edge INSERT — link's statement, shared verbatim by the
   * one-gesture relations (#insertRelations), the supersede bridge, the
   * merge bridges and the supersede's inherited-edge copy. Idempotent per
   * (from, to, kind).
   */
  #insertEdge(
    fromId: string,
    toId: string,
    kind: string,
    metadata: string | null,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(fromId, toId, kind, metadata, createdAt);
  }

  /**
   * Raw metadata of one memory, parsed; null when the row is absent or the
   * column is null. Internal helper for successor construction — never
   * surfaces to callers.
   */
  #readMeta(id: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT metadata FROM memories WHERE id = ?').get(id) as
      { metadata: string | null } | undefined;
    if (row === undefined) return null;
    return parseRawMetadata(row.metadata);
  }

  /**
   * Structural metadata for a supersede/merge successor built from source
   * metadata: kind carries only when every source agrees, tags union across
   * sources. Explicit options.metadata wins verbatim — inherit happens only
   * when the caller passed no metadata at all. Rationale: kind is what the
   * CLI's read filters select on; a kind-less successor silently drops out
   * of those filters (observed defect October 2026, caught by the
   * cold-reader re-test). Contextual metadata is never copied — the
   * successor's content describes new state.
   */
  #structuralInherit(
    metadataList: Array<Record<string, unknown> | null>,
  ): Record<string, unknown> | null {
    const kinds = new Set<unknown>();
    const tags: unknown[] = [];
    for (const metadata of metadataList) {
      if (!metadata) continue;
      if ('kind' in metadata && metadata['kind'] !== undefined) kinds.add(metadata['kind']);
      if (Array.isArray(metadata['tags'])) {
        for (const tag of metadata['tags'] as unknown[]) {
          if (!tags.some((existing) => JSON.stringify(existing) === JSON.stringify(tag))) {
            tags.push(tag);
          }
        }
      }
    }
    const structural: Record<string, unknown> = {};
    if (kinds.size === 1) structural['kind'] = [...kinds][0];
    if (tags.length > 0) structural['tags'] = tags;
    return Object.keys(structural).length > 0 ? structural : null;
  }

  close(): void {
    this.db.close();
  }

  /**
   * Run an operation that may hit SQLITE_BUSY under concurrent WAL access.
   * Retries with a short delay until `BUSY_RETRIES` is exhausted.
   */
  #withBusyRetry<GOutput>(operation: () => GOutput): GOutput {
    let lastError: unknown;
    for (let attempt = 0; attempt < BUSY_RETRIES; attempt++) {
      try {
        return operation();
      } catch (err) {
        if (
          err instanceof Error &&
          'errcode' in err &&
          (err as { errcode: number }).errcode === SQLITE_BUSY
        ) {
          lastError = err;
          // Synchronous sleep on purpose: #withBusyRetry must stay sync —
          // an async sleep would change every caller's contract.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, BUSY_DELAY_MS);
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }
}
