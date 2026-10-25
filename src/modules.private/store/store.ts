import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { migrate, SCHEMA_VERSION, schemaVersion } from './migration/migration.ts';

export type UUID = string;

/**
 * The five-state machine — the single source of truth for a memory's life
 * (#38): `active` is the living baseline, `hot` its curated sub-state (the
 * machine's only reversible edge, setHot), and `superseded` /
 * `deprecated` / `merged` are the terminals. The refusals operate on the
 * LIVING set (`active` + `hot`); the terminals refuse every write gesture.
 */
export type MemoryStatus = 'active' | 'hot' | 'superseded' | 'deprecated' | 'merged';

/**
 * The condensation ceiling: a memory longer than this owes its summary at
 * write time, and no summary may exceed it either. Characters, not bytes —
 * ~100 tokens, so a checkin serving twenty hot memories costs ~2K tokens
 * of content while the full text stays one `get` away. Fixed by the store,
 * not configurable — the contract is the contract.
 */
export const MAX_SUMMARY_LENGTH = 400;

/**
 * The doctor's check count — the corruption family the audit reports
 * findings from (orphan_edges, invalid_metadata_json, status_without_bridge,
 * fts_integrity, file_permissions). Tests pin it as part of the report
 * shape. The legacy sixth check (hot_without_active) retired with the hot
 * column (#38): hot is a status now, and hot-on-a-terminal is
 * unrepresentable.
 */
export const DOCTOR_CHECK_COUNT = 5;

/**
 * The checkout's check count — the consolidation gate the verdict reports
 * findings from (no_hot, isolated_living, duplicate_titles). Tests pin it
 * as part of the report shape.
 */
export const CHECKOUT_CHECK_COUNT = 3;

/**
 * The one-line FTS rebuild — the repair route outside the library (the
 * store's own connection is `#db`-private); named by the fts_integrity
 * hint.
 */
const FTS_REBUILD_HINT =
  "rebuild the index with SQL: INSERT INTO memories_fts(memories_fts) VALUES('rebuild') — mechanical, no content rewrite";

/**
 * One record in a store: content, its kind (the required, free-vocabulary
 * classification — a column since v6, #31), its authored summary (the
 * condensation that lets checkin and search serve more memories per call —
 * owed when the content runs past the ceiling), metadata, and a status —
 * the five-state machine (#38). Curation is earned after the fact (setHot
 * moves `active` to `hot`), never at birth, and survives only on the
 * living: supersede transfers it to the head, merge unions it, every
 * termination cools it.
 */
export interface Memory {
  readonly id: UUID;
  readonly content: string;
  readonly kind: string;
  readonly summary: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
  readonly status: MemoryStatus;
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
  /**
   * The memory's classification — a required column with a free
   * vocabulary, no enum (#31: the real v0.1 store carried kind on every
   * row, and dream/vision rule the enum out). Required at store: a
   * kind-less memory does not exist. `metadata.kind` is refused — kind
   * is a column, one spelling.
   */
  readonly kind: string;
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

/** supersede's own options — the split the kind column rules (#31):
 *  `kind` is OPTIONAL here, omitted = inherited from the source's
 *  column; a revision may reclassify. Everything else matches
 *  store's options. */
export interface SupersedeOptions extends Omit<StoreOptions, 'kind'> {
  readonly kind?: string;
}

/** merge's own options — it bridges its sources (the `merges` edges come
 *  from the fusion itself), so the one-gesture `relations` of
 *  StoreOptions has no meaning here. `kind` is optional: omitted =
 *  inherited when every source agrees, refused with the candidate kinds
 *  when they disagree; provided = it wins. */
export interface MergeOptions {
  readonly kind?: string;
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
 * (get, list, search, checkin) serves. Out-edges expand into target nodes
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
 * missing memory in a hand-corrupted store (checkout, #13, reports it).
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
   * Include the terminals (superseded/deprecated/merged) — the --all
   * surface (living-only by default: active + hot, #38).
   */
  readonly includeTerminals?: boolean;
  /**
   * A raw SQL condition on the memories row (`kind = 'note'` and
   * friends) — the grant opt-in that the server surface gates. Since v6
   * kind is a column: the idiom is a plain column comparison, not a
   * `metadata->>'$.kind'` JSON path.
   */
  readonly where?: string;
}

export interface SearchOptions {
  readonly limit?: number;
  /** Same contract as ListOptions.includeTerminals: the terminals join the living default. */
  readonly includeTerminals?: boolean;
  readonly where?: string;
}

export interface CheckinOptions {
  /**
   * The hot block's cap. Absent: no cap — checkin serves the whole set;
   * order guides attention, nothing drops.
   */
  readonly limit?: number;
}

export interface Stats {
  readonly memories: number;
  readonly memories_by_status: Readonly<Record<string, number>>;
  readonly memories_by_kind: Readonly<Record<string, number>>;
  readonly edges: number;
  readonly edges_by_kind: Readonly<Record<string, number>>;
}

/**
 * The checkin ritual's report: the curated hot block plus the store's
 * shape. The block an agent's fresh session reads in one call.
 */
export interface CheckinReport {
  /** The hot memories (status 'hot'), newest first, relations included. */
  readonly hot: readonly MemoryWithRelations[];
  readonly stats: Stats;
}

/**
 * The doctor's finding-producing checks — the corruption family: states
 * the write surface cannot produce (hand SQL on a second connection,
 * external tools). The legacy kind-based checks (active_without_kind,
 * stale_handoff, weight_bounds) are not in the vocabulary: kind is a
 * NOT NULL column from v6 on (kind-less memories no longer exist, #31)
 * and the weight column is gone.
 */
export type DoctorCheck =
  | 'orphan_edges'
  | 'invalid_metadata_json'
  | 'status_without_bridge'
  | 'fts_integrity'
  | 'file_permissions';

/**
 * One problem the doctor reports. `id` carries the implicated memory
 * where one exists (edge findings name both endpoints in the detail).
 * The hint names the SQL — the doctor diagnoses, the operator repairs.
 */
export interface DoctorFinding {
  readonly check: DoctorCheck;
  readonly id?: UUID;
  readonly detail: string;
  readonly hint: string;
}

/**
 * The corruption audit's report: the store's drift, findings ordered by
 * check. Read-only — the operator runs it (the manager CLI's offline
 * verb, fog); the agent's closure gate is checkout, deliberately
 * separate.
 */
export interface DoctorReport {
  readonly healthy: boolean;
  readonly findings: readonly DoctorFinding[];
  readonly summary: {
    readonly checks: number;
    readonly issues: number;
    readonly memories: number;
    readonly edges: number;
    readonly edges_by_kind: Readonly<Record<string, number>>;
  };
}

/**
 * The checkout's finding-producing checks — the consolidation gate: the
 * closure debts an agent pays with the raw verbs. No check depends on a
 * `kind` or a window: the verdict is timeless store state.
 */
export type CheckoutCheck = 'no_hot' | 'isolated_living' | 'duplicate_titles';

/**
 * One problem the checkout returns. All-or-nothing: no severity — a debt
 * either blocks the green light or the store is healthy. `id` carries the
 * implicated memory where one exists; the hint names the payable verb.
 */
export interface CheckoutFinding {
  readonly check: CheckoutCheck;
  readonly id?: UUID;
  readonly detail: string;
  readonly hint: string;
}

/**
 * The agent's closure gate's report: the consolidation debts, corruption
 * excluded (doctor's business). `healthy` is the green light to end a
 * session — earned, never granted: zero findings, all payable with the
 * raw verbs.
 */
export interface CheckoutReport {
  readonly healthy: boolean;
  readonly findings: readonly CheckoutFinding[];
  readonly summary: {
    readonly checks: number;
    readonly issues: number;
    readonly memories: number;
    readonly hot_memories: number;
  };
}

export interface ForkOptions {
  /**
   * Overwrite an existing target file (and its WAL sidecars). Default
   * off — a fork never clobbers an existing store silently.
   */
  readonly force?: boolean;
}

export interface ForkResult {
  /** Absolute path of the forked store. */
  readonly path: string;
  /** Memories copied (all statuses) — an exact copy: nothing added. */
  readonly memories: number;
  /** Relations copied. */
  readonly edges: number;
}

/**
 * The db file and its WAL sidecars — the trio every permission pass and a
 * forced fork refresh must treat together.
 */
function sidecarPaths(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

/**
 * Tightens a store file and its WAL sidecars to owner-only permissions.
 * The store IS the agent's identity (directives, decisions, transcripts) —
 * the same argument that makes a group-readable token file a refusal
 * applies to the store file. Best-effort: a failed chmod never bricks the
 * open; the checkout's file_permissions check is the visible enforcer for
 * anything this pass cannot reach (win32 skipped — stat mode is unreliable).
 */
function tightenPermissions(dbPath: string): void {
  if (process.platform === 'win32') return;
  for (const path of sidecarPaths(dbPath)) {
    try {
      if (existsSync(path)) chmodSync(path, 0o600);
    } catch {
      // best effort — checkout's file_permissions check reports drift
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
  readonly kind: string;
  readonly summary: string | null;
  readonly metadata: string | null;
  readonly created_at: string;
  readonly status: string;
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
    kind: row.kind,
    summary: row.summary,
    metadata: parseRawMetadata(row.metadata),
    created_at: row.created_at,
    status: row.status as MemoryStatus,
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
 * Limit validation shared by list/search/checkin: absent means the verb's
 * own default (checkin: no cap), anything else must be an integer >= 1.
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
 * The LIVING set (#38): `active` + `hot`. Living is a glossary concept —
 * the refusal set of the write verbs (supersede, merge, deprecate, unlink
 * endpoints), setHot's transition domain, and the checkout's read; this
 * is its one spelling in code.
 */
function isLiving(status: MemoryStatus): boolean {
  return status === 'active' || status === 'hot';
}

/**
 * store's kind contract: REQUIRED — a memory always carries its
 * classification. The vocabulary is free (no enum, #31); the error names
 * the interface, so an agent learns the shape on first refusal.
 */
function assertStoreKind(kind: string): void {
  if (typeof kind !== 'string' || !kind) {
    throw new Error('kind is required: pass kind ("note", "decision", …) — the vocabulary is free');
  }
}

/**
 * supersede/merge's kind contract: optional, but present means a real
 * string — an empty kind classifies nothing.
 */
function assertOptionalKind(kind: string | undefined): void {
  if (kind !== undefined && (typeof kind !== 'string' || !kind)) {
    throw new Error('kind must be non-empty');
  }
}

/**
 * `metadata.kind` is refused everywhere a successor or memory is
 * authored (store, supersede, merge): kind is a column from v6 on —
 * one spelling, the interface teaches (#31). Letting the old spelling
 * ride metadata would smuggle the divergence the strip just buried back
 * into new writes.
 */
function refuseMetadataKind(metadata: Record<string, unknown> | undefined | null): void {
  if (metadata && 'kind' in metadata) {
    throw new Error('kind is a column — pass kind, not metadata.kind');
  }
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
  readonly #db: DatabaseSync;
  readonly dbPath: string;
  /** True when opened with readOnly — write verbs refuse, migration is
   *  skipped. */
  readonly readOnly: boolean;

  // The one `private` the code style allows: `#` cannot prefix a
  // constructor, and hiding it is what makes `open` the only way in.
  private constructor(db: DatabaseSync, dbPath: string, readOnly: boolean) {
    this.#db = db;
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
   * checkout's VACUUM INTO snapshot — a file-level write to a NEW file,
   * never to the store itself — lands there).
   */
  #assertWritable(): void {
    if (this.readOnly) {
      throw new Error('store is read-only (opened with readOnly: true); writes are refused');
    }
  }

  /**
   * The write verbs' shared pre-check: refuse an unknown id by name, then
   * refuse any terminal status — supersede/merge/deprecate only ever touch
   * the living (`active` + `hot`, #38). Returns the memory's status AND
   * its kind column: supersede transfers a hot source's status to the head
   * and inherits the kind from the source (unless reclassified); merge
   * unions the status across sources and reads every source's kind for the
   * inheritance rule.
   */
  #requireLiving(
    id: string,
    verb: string,
  ): { readonly status: MemoryStatus; readonly kind: string } {
    const row = this.#db.prepare('SELECT status, kind FROM memories WHERE id = ?').get(id) as
      { status: MemoryStatus; kind: string } | undefined;
    if (!row) throw new Error(`memory not found: ${id}`);
    if (!isLiving(row.status)) {
      throw new Error(`cannot ${verb} a memory with status '${row.status}'`);
    }
    return row;
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
      this.#db.exec('BEGIN');
      try {
        const result = operation();
        this.#db.exec('COMMIT');
        return result;
      } catch (err) {
        this.#db.exec('ROLLBACK');
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
   * Store a memory: UUID id, its required kind (the free-vocabulary
   * classification, #31), metadata JSON, born active and cold — curation
   * (the `hot` status) is earned after the fact (setHot), never at birth.
   * The one-gesture relations land in the same transaction: the memory and
   * its edges arrive together or not at all.
   */
  store(content: string, options: StoreOptions): string {
    this.#assertWritable();
    if (!content) throw new Error('content must be non-empty');
    assertStoreKind(options.kind);
    refuseMetadataKind(options.metadata);
    this.#checkSummary(content, options.summary ?? null);
    const id = randomUUID();
    const summary = options.summary ?? null;
    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
    const created_at = new Date().toISOString();
    this.#transaction(() => {
      this.#db
        .prepare(
          'INSERT INTO memories (id, content, kind, summary, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, content, options.kind, summary, metadata, created_at);
      if (options.relations?.length) {
        this.#insertRelations(id, options.relations, created_at);
      }
    });
    return id;
  }

  /**
   * Revise a memory: the successor carries the content, the source's kind
   * column (reclassify with `kind` — a revision may reclassify, #31),
   * the structural metadata (tags unioned) and — when no explicit
   * relations are given — the source's outgoing edges VERBATIM
   * (kind, metadata, created_at copied row by row). A revision corrects
   * CONTENT, not the relation set; the old memory keeps its edges as
   * provenance (addition-only, nothing moves). Explicit relations win over
   * inheritance, the same way explicit metadata overrides structural
   * inheritance. The supersedes bridge lands old→new, the old memory dies
   * `superseded`, and a hot source's status TRANSFERS to the head — the
   * revision replaces what checkin would have served.
   */
  supersede(oldId: string, content: string, options: SupersedeOptions = {}): string {
    this.#assertWritable();
    if (!content) throw new Error('content must be non-empty');
    assertOptionalKind(options.kind);
    refuseMetadataKind(options.metadata);
    this.#checkSummary(content, options.summary ?? null);
    const newId = randomUUID();
    const created_at = new Date().toISOString();
    this.#transaction(() => {
      const { status, kind: inheritedKind } = this.#requireLiving(oldId, 'supersede');
      const kind = options.kind ?? inheritedKind;
      const inherited = options.metadata ?? this.#structuralInherit([this.#readMeta(oldId)]);
      const metadata = inherited ? JSON.stringify(inherited) : null;
      this.#db
        .prepare(
          'INSERT INTO memories (id, content, kind, summary, metadata, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(newId, content, kind, options.summary ?? null, metadata, created_at, status);
      if (!options.relations?.length) {
        const inheritedEdges = this.#db
          .prepare('SELECT to_id, kind, metadata, created_at FROM edges WHERE from_id = ?')
          .all(oldId) as unknown as Array<{
          to_id: string;
          kind: string;
          metadata: string | null;
          created_at: string;
        }>;
        const memoryExists = this.#db.prepare('SELECT 1 FROM memories WHERE id = ?');
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
      this.#db.prepare("UPDATE memories SET status = 'superseded' WHERE id = ?").run(oldId);
    });
    return newId;
  }

  /**
   * Fuse memories: one successor carries the content and the kind column —
   * inherited when every source agrees, refused with the candidate kinds
   * when they disagree and `kind` is omitted, the provided `kind` wins
   * (#31: refuse, don't hide — a fusion never guesses its classification).
   * The structural metadata carries the tags unioned; each source keeps a
   * `merges` bridge as provenance and dies `merged`. The hot status UNIONS
   * across sources — if any source was headed for checkin, the fusion is.
   * The curation is the fusion's now: a hot source heats it; none does,
   * and the fusion stays active.
   */
  merge(ids: readonly string[], content: string, options: MergeOptions = {}): string {
    this.#assertWritable();
    if (ids.length < 2) throw new Error('merge requires at least 2 memories');
    if (!content) throw new Error('content must be non-empty');
    assertOptionalKind(options.kind);
    refuseMetadataKind(options.metadata);
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
      const kinds = new Set<string>();
      let anySourceHot = false;
      for (const id of ids) {
        const { status, kind } = this.#requireLiving(id, 'merge');
        if (status === 'hot') anySourceHot = true;
        kinds.add(kind);
        metadataList.push(this.#readMeta(id));
      }
      let kind: string;
      if (options.kind !== undefined) {
        kind = options.kind;
      } else if (kinds.size === 1) {
        kind = [...kinds][0]!;
      } else {
        const candidates = [...kinds].sort().join(', ');
        throw new Error(
          `merge refused: sources disagree on kind (${candidates}) — pass kind to classify the fusion`,
        );
      }
      const inherited = options.metadata ?? this.#structuralInherit(metadataList);
      const metadata = inherited ? JSON.stringify(inherited) : null;
      this.#db
        .prepare(
          'INSERT INTO memories (id, content, kind, summary, metadata, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          newId,
          content,
          kind,
          options.summary ?? null,
          metadata,
          created_at,
          anySourceHot ? 'hot' : 'active',
        );
      for (const id of ids) {
        this.#insertEdge(id, newId, 'merges', null, created_at);
        this.#db.prepare("UPDATE memories SET status = 'merged' WHERE id = ?").run(id);
      }
    });
    return newId;
  }

  /**
   * End a memory deliberately: deprecated stays in the store (history is
   * never rewritten) and refuses any further write gesture. Cooling is
   * free — the status just moves, no parallel mark to clear. There is no
   * delete — persistent memory obliges. The check and the update share the
   * transaction: under concurrency, exactly one deprecate wins.
   */
  deprecate(id: string): void {
    this.#assertWritable();
    this.#transaction(() => {
      this.#requireLiving(id, 'deprecate');
      this.#db.prepare("UPDATE memories SET status = 'deprecated' WHERE id = ?").run(id);
    });
  }

  /**
   * The one non-graph mutation: curation. The state machine's only
   * reversible edge — `active` ↔ `hot` (#38): a hot memory is an active
   * one the checkin ritual serves (#12), and a
   * superseded/deprecated/merged memory must not resurface through it, so
   * the edge exists only among the living. The check and the write share
   * the transaction: a racing supersede and the curation resolve to
   * exactly one winner.
   */
  setHot(id: string, hot: boolean): void {
    this.#assertWritable();
    this.#transaction(() => {
      const row = this.#readStatus(id);
      if (!row) throw new Error(`memory not found: ${id}`);
      if (!isLiving(row)) {
        throw new Error(`cannot setHot a memory with status '${row}'`);
      }
      this.#db
        .prepare('UPDATE memories SET status = ? WHERE id = ?')
        .run(hot ? 'hot' : 'active', id);
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
    // Refuse-don't-hide: an edge from a memory to itself names no
    // relationship. The one-gesture paths are a construction impossibility
    // (the new id is unknown to the caller), so this verb is the only door.
    if (fromId === toId) {
      throw new Error('self-edge refused: from and to must be different memories');
    }
    const fromExists = this.#withBusyRetry(() =>
      this.#db.prepare('SELECT 1 FROM memories WHERE id = ?').get(fromId),
    );
    if (!fromExists) throw new Error(`memory not found: ${fromId}`);
    const toExists = this.#withBusyRetry(() =>
      this.#db.prepare('SELECT 1 FROM memories WHERE id = ?').get(toId),
    );
    if (!toExists) throw new Error(`memory not found: ${toId}`);

    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
    const created_at = new Date().toISOString();
    this.#withBusyRetry(() => this.#insertEdge(fromId, toId, kind, metadata, created_at));
  }

  /**
   * Remove one edge — a CORRECTION among the living: both endpoints must
   * be living (active or hot, #38), which makes the supersedes/merges
   * bridges untouchable by construction (they leave a non-living source).
   * Persistent memory obliges: the graph only grows, except to fix a
   * just-made mistake. The pair (from, to) identifies the edge when it
   * carries a single kind; with several kinds on the same directed pair
   * the removal is refused with the candidate list — refuse, don't hide.
   * kind omitted + edges on the REVERSE pair surfaces them: the
   * transposed-uuid mistake gets a direction hint, not a bare not-found.
   * Removes exactly one edge row — no cascade, no update; a wrong edge is
   * recreated right, never edited.
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
      if (!isLiving(fromStatus)) {
        throw new Error(`cannot unlink a memory with status '${fromStatus}'`);
      }
      if (!isLiving(toStatus)) {
        throw new Error(`cannot unlink a memory with status '${toStatus}'`);
      }

      if (kind !== undefined) {
        if (!kind) throw new Error('kind must be non-empty');
        const result = this.#db
          .prepare('DELETE FROM edges WHERE from_id = ? AND to_id = ? AND kind = ?')
          .run(fromId, toId, kind);
        if (result.changes === 0) {
          throw new Error(`edge not found: ${fromId} -> ${toId} (${kind})`);
        }
        return;
      }

      const directed = this.#db
        .prepare('SELECT kind FROM edges WHERE from_id = ? AND to_id = ? ORDER BY kind')
        .all(fromId, toId) as unknown as Array<{ kind: string }>;
      if (directed.length === 1) {
        this.#db
          .prepare('DELETE FROM edges WHERE from_id = ? AND to_id = ? AND kind = ?')
          .run(fromId, toId, directed[0]!.kind);
        return;
      }
      if (directed.length === 0) {
        const reverse = this.#db
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
    const out = this.#db
      .prepare(
        'SELECT from_id, to_id, kind, metadata, created_at FROM edges' +
          ' WHERE from_id = ? ORDER BY created_at DESC',
      )
      .all(memory.id) as unknown as RelationRow[];
    const inRows = this.#db
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
   * enforcement makes it impossible through this store; the checkout
   * reports the drift). Never throws on absence.
   */
  #expandToNode(id: string, depth: number, visited: Set<string>): MemoryWithRelations | null {
    const row = this.#db
      .prepare(
        'SELECT id, content, kind, summary, metadata, created_at, status FROM memories WHERE id = ?',
      )
      .get(id) as unknown as MemoryRow | undefined;
    if (!row) return null;
    return this.#projectNode(parseMemoryRow(row), depth, visited);
  }

  /**
   * Search memories by FTS5 match, ranked by pure bm25 — search wants to
   * search everywhere: no weight, recency or access terms (the legacy
   * ranking factors died with their columns). Living-only unless
   * includeTerminals (`active` + `hot`, #38), narrowed by the where grant,
   * limit 20 by default. Hits are projected nodes (depth-1 relations
   * included).
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
      'SELECT m.id, m.content, m.kind, m.summary, m.metadata, m.created_at, m.status,' +
      ' (bm25(memories_fts)) AS rank' +
      ' FROM memories_fts f JOIN memories m ON m.rowid = f.rowid' +
      ' WHERE memories_fts MATCH ?';
    if (options.includeTerminals !== true) {
      sql += ` AND m.status IN ('active', 'hot')`;
    }
    if (options.where) {
      sql += ` AND ${options.where}`;
    }
    sql += ' ORDER BY rank LIMIT ?';
    const runQuery = (match: string): SearchResult[] => {
      const rows = this.#db.prepare(sql).all(match, limit) as unknown as Array<
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
   * The checkin ritual in one call — the deep-module home the HTTP
   * /checkin endpoint and the MCP checkin tool will both serve. The hot
   * block replaces the legacy kind blocks: the hot memories (status
   * 'hot', #38) served as projected nodes, relations included (zero
   * drill-in), newest first. No cap by default — the limit opt guides
   * attention without ever dropping anything silently. Reads stay reads.
   */
  checkin(options: CheckinOptions = {}): CheckinReport {
    // LIMIT -1 is SQLite's no-cap form: the hot set serves whole.
    const limit = normaliseLimit(options.limit, -1);
    const rows = this.#db
      .prepare(
        'SELECT id, content, kind, summary, metadata, created_at, status FROM memories' +
          " WHERE status = 'hot' ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as unknown as MemoryRow[];
    return {
      hot: rows.map((row) => this.#projectNode(parseMemoryRow(row), 1, new Set<string>())),
      stats: this.stats(),
    };
  }

  /**
   * List memories as projected nodes: newest first, living-only unless
   * includeTerminals (`active` + `hot`, #38), paged by limit/offset,
   * narrowed by the where grant. Every row carries its depth-1 relations
   * block — list is the set-serving verb, and the projection rides free
   * next to the content read.
   */
  list(options: ListOptions = {}): MemoryWithRelations[] {
    const limit = normaliseLimit(options.limit, 20);
    const offset = normaliseOffset(options.offset);
    let sql = 'SELECT id, content, kind, summary, metadata, created_at, status FROM memories';
    const conditions: string[] = [];
    if (options.includeTerminals !== true) {
      conditions.push("status IN ('active', 'hot')");
    }
    if (options.where) {
      conditions.push(options.where);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const rows = this.#db.prepare(sql).all(limit, offset) as unknown as MemoryRow[];
    return rows.map((row) => this.#projectNode(parseMemoryRow(row), 1, new Set<string>()));
  }

  /**
   * The store's shape in one aggregate call — counts, not rows. Reads
   * never move these numbers (no access signal): two stats() calls across
   * any reads return the same report. The by-kind ledger reads the
   * COLUMN over every status — every memory appears, kind is a required
   * column (kind-less memories no longer exist; the migration marks the
   * rows it could not classify 'unclassified', #31). Hot reads through
   * `memories_by_status['hot']` — the same convenience precedent as the
   * retired `active_memories` (#38).
   */
  stats(): Stats {
    const memories_by_status: Record<string, number> = {};
    const statusRows = this.#db
      .prepare('SELECT status, count(*) AS c FROM memories GROUP BY status ORDER BY status')
      .all() as unknown as Array<{ status: string; c: number }>;
    for (const row of statusRows) {
      memories_by_status[row.status] = row.c;
    }
    const memories_by_kind: Record<string, number> = {};
    const kindRows = this.#db
      .prepare('SELECT kind, count(*) AS c FROM memories GROUP BY kind ORDER BY kind')
      .all() as unknown as Array<{ kind: string; c: number }>;
    for (const row of kindRows) {
      memories_by_kind[row.kind] = row.c;
    }
    const edges_by_kind: Record<string, number> = {};
    const kindEdges = this.#db
      .prepare('SELECT kind, count(*) AS c FROM edges GROUP BY kind ORDER BY kind')
      .all() as unknown as Array<{ kind: string; c: number }>;
    for (const row of kindEdges) {
      edges_by_kind[row.kind] = row.c;
    }
    return {
      memories: this.#count('SELECT count(*) AS c FROM memories'),
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
    const row = this.#db.prepare(sql).get() as unknown as { c: number };
    return row.c;
  }

  // --- the verdicts (#13) : doctor (corruption) + checkout (consolidation) --

  /**
   * The corruption audit — the operator's matter. Reports the states the
   * write surface cannot produce: hand SQL on a second connection and
   * external tools are their only producers (FK enforcement and the
   * write-time checks close every library door). Every finding is payable
   * in SQL — the audit diagnoses, it never repairs. Read-only — it takes
   * no write lock on a store agents write to concurrently, and runs
   * read-only against a read-only open; the VACUUM INTO snapshot of
   * #checkFts lands in a temp dir, never in the store. The checkout's
   * complement: the agent's closure gate (checkout) reports the debts its
   * verbs can pay; this audit reports the drift only the operator can.
   * Findings come ordered by check.
   */
  doctor(): DoctorReport {
    const memories = this.#db
      .prepare('SELECT id, content, kind, summary, metadata, created_at, status FROM memories')
      .all() as unknown as MemoryRow[];
    const edges = this.#db
      .prepare('SELECT from_id, to_id, kind, metadata, created_at FROM edges')
      .all() as unknown as RelationRow[];
    const byId = new Map(memories.map((memory) => [memory.id, memory]));
    const findings: DoctorFinding[] = [];

    // Metadata parse probed ONCE — no check reads metadata content (kind
    // left the metadata: it is a column from v6 on, #31), so the only fact
    // worth keeping is the set of ids whose column is not valid JSON:
    // invalid_metadata_json is where the corruption speaks, one finding
    // per root cause (reads collapse invalid JSON into null metadata,
    // silently).
    const invalidMetadataIds = new Set<string>();
    for (const memory of memories) {
      if (memory.metadata === null) continue;
      try {
        JSON.parse(memory.metadata);
      } catch {
        invalidMetadataIds.add(memory.id);
      }
    }

    // An edge naming a missing memory — FK enforcement makes it impossible
    // through the verbs; hand SQL is the only producer.
    for (const edge of edges) {
      if (!byId.has(edge.from_id) || !byId.has(edge.to_id)) {
        findings.push({
          check: 'orphan_edges',
          detail: `edge ${edge.from_id} -> ${edge.to_id} (${edge.kind}) references a missing memory`,
          hint: 'the store was edited outside the library; restore the missing memory or remove the edge with direct SQL',
        });
      }
    }

    // Invalid metadata JSON — the write surface cannot produce it (the
    // verbs take a typed object and serialize; metadata is immutable after
    // store), and reads collapse it into null, so the audit is where the
    // corruption speaks.
    for (const memory of memories) {
      if (invalidMetadataIds.has(memory.id)) {
        findings.push({
          check: 'invalid_metadata_json',
          id: memory.id,
          detail: 'metadata column is not valid JSON',
          hint: 'replace it with a valid object via direct SQL — the write surface cannot edit metadata after store',
        });
      }
    }

    // A superseded/merged status with no supersedes/merges bridge —
    // supersede and merge always bridge in the same transaction, so only a
    // hand-edited status lands without one.
    for (const memory of memories) {
      if (memory.status !== 'superseded' && memory.status !== 'merged') continue;
      const bridged = edges.some(
        (edge) =>
          edge.from_id === memory.id && (edge.kind === 'supersedes' || edge.kind === 'merges'),
      );
      if (!bridged) {
        findings.push({
          check: 'status_without_bridge',
          id: memory.id,
          detail: `status '${memory.status}' but no supersedes/merges edge outgoing`,
          hint: "hand-edited status: restore 'active' via SQL, or create the bridge edge to the successor memory",
        });
      }
    }

    // (The hot-without-active audit retired with the hot column, #38: hot
    // is a status now — the contradiction it caught is unrepresentable.)

    findings.push(...this.#checkFts());

    // The store file carries the agent's whole identity — a group/world-
    // readable store voids the boundary the ownership lock enforces
    // elsewhere. tightenPermissions is best-effort; this is the mechanical
    // report for anything it could not reach.
    if (process.platform !== 'win32') {
      try {
        const mode = statSync(this.dbPath).mode;
        if ((mode & 0o077) !== 0) {
          findings.push({
            check: 'file_permissions',
            detail: `store file readable by group/others (mode 0${(mode & 0o777).toString(8)})`,
            hint: `chmod 600 ${this.dbPath} — a shared-readable store file voids the identity boundary`,
          });
        }
      } catch {
        // an unreadable stat is no finding here — the other checks surface
        // what actually matters about the store's contents
      }
    }

    const edges_by_kind: Record<string, number> = {};
    for (const edge of edges) {
      edges_by_kind[edge.kind] = (edges_by_kind[edge.kind] ?? 0) + 1;
    }
    return {
      healthy: findings.length === 0,
      findings,
      summary: {
        checks: DOCTOR_CHECK_COUNT,
        issues: findings.length,
        memories: memories.length,
        edges: edges.length,
        edges_by_kind,
      },
    };
  }

  /**
   * The agent's closure gate — the session-exit ritual (Checkin's pair).
   * Reports the consolidation debts ONLY: a register nobody curated is a
   * ghost, islands mark memories a session stored without exploring the
   * graph, duplicate titles mark candidates a session never fused. Every
   * finding is payable with the raw verbs, so the green light — healthy,
   * zero findings — is always reachable. All-or-nothing: no severity, no
   * window, no check reads a kind. The corruption audit is doctor's
   * business, deliberately NOT composed here: a corruption finding would
   * be a debt no verb can pay, and the gate would never go green on a
   * hand-corrupted store.
   */
  checkout(): CheckoutReport {
    const memories = (
      this.#db
        .prepare('SELECT id, content, kind, summary, metadata, created_at, status FROM memories')
        .all() as unknown as MemoryRow[]
    ).map(parseMemoryRow);
    const edges = this.#db
      .prepare('SELECT from_id, to_id, kind, metadata, created_at FROM edges')
      .all() as unknown as RelationRow[];
    const findings: CheckoutFinding[] = [];

    // A register nobody curated is a ghost — the next checkin serves an
    // empty hot block and a fresh session reads nothing. Silent when there
    // is nothing to serve (no memories, no living).
    const livingCount = memories.filter((memory) => isLiving(memory.status)).length;
    const hotCount = memories.filter((memory) => memory.status === 'hot').length;
    if (livingCount > 0 && hotCount === 0) {
      findings.push({
        check: 'no_hot',
        detail: `${livingCount} living memories and none hot — the next checkin serves an empty block`,
        hint: 'setHot the memories a fresh session must read — the register owes curation',
      });
    }

    // Edge-less living memories while other living ones exist to relate to
    // — the session-end nudge to explore the memory before closing. The
    // gate reads the LIVING set: a hot memory owes a relation as much as
    // an active one (the widening is deliberate, #38). One finding, ids
    // aggregated; a one-memory store is an atom, not an island.
    const isolated = memories.filter(
      (memory) =>
        isLiving(memory.status) &&
        !edges.some((edge) => edge.from_id === memory.id || edge.to_id === memory.id),
    );
    if (isolated.length > 0 && livingCount >= 2) {
      const ids = isolated.map((memory) => memory.id).join(', ');
      findings.push({
        check: 'isolated_living',
        detail: `${isolated.length} living memories hold no edges in either direction: ${ids}`,
        hint: 'link them to related memories, merge or supersede what duplicates, deprecate what was a mistake — a register of islands is unconsolidated',
      });
    }

    // Two living memories sharing the exact first-line markdown heading
    // are candidates to merge — text-level, self-contained, no kind.
    // Heading-less memories never group. Hot counts here too: two hot
    // memories with one title are exactly the fusion checkin would serve
    // twice (the widening is deliberate, #38).
    const titleGroups = new Map<string, string[]>();
    for (const memory of memories) {
      if (!isLiving(memory.status)) continue;
      const firstLine = memory.content.split('\n')[0]!.trim();
      if (!firstLine.startsWith('#')) continue;
      const group = titleGroups.get(firstLine) ?? [];
      group.push(memory.id);
      titleGroups.set(firstLine, group);
    }
    for (const [title, ids] of titleGroups) {
      if (ids.length > 1) {
        findings.push({
          check: 'duplicate_titles',
          detail: `${ids.length} living memories share the title "${title}": ${ids.join(', ')}`,
          hint: 'merge the group, or supersede with a distinct title',
        });
      }
    }

    return {
      healthy: findings.length === 0,
      findings,
      summary: {
        checks: CHECKOUT_CHECK_COUNT,
        issues: findings.length,
        memories: memories.length,
        hot_memories: hotCount,
      },
    };
  }

  /**
   * Fork the store: an exact copy at targetPath — the mitosis primitive
   * of the fork model (a store is an individual; forks never re-sync).
   * The copy is a VACUUM INTO snapshot: safe under concurrent WAL writers,
   * compacted, FTS index included — and NOTHING is added to it. A fork
   * that should know its origin gets told by its forker, in the forker's
   * own words: store a memory in the child after the copy (the tool does
   * not presume the narrative — archive, gift, sandbox, product seed).
   * Fork never writes to the parent, so it is allowed on a read-only
   * open: an archive can be forked without waking it. Restoring a dormant
   * fork is rebirth, never resync. Backup scheduling and transport stay
   * outside the library — this is the copy primitive only.
   */
  fork(targetPath: string, options: ForkOptions = {}): ForkResult {
    const target = resolve(targetPath);
    if (existsSync(target) && options.force !== true) {
      throw new Error(`fork target already exists: ${target} (pass force to overwrite)`);
    }
    if (options.force === true) {
      // VACUUM INTO refuses an existing target; a forced refresh removes
      // the old file and its WAL sidecars first.
      for (const path of sidecarPaths(target)) {
        rmSync(path, { force: true });
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    // Reporting counts, read on this connection right before the snapshot:
    // the copied rows are exactly these (a concurrent commit in between
    // could skew the report, never the copy itself).
    const memories = this.#count('SELECT count(*) AS c FROM memories');
    const edges = this.#count('SELECT count(*) AS c FROM edges');
    const quoted = target.replace(/'/g, "''");
    this.#withBusyRetry(() => this.#db.exec(`VACUUM INTO '${quoted}'`));
    tightenPermissions(target);
    return { path: target, memories, edges };
  }

  /**
   * Verify the FTS5 index against the memories table on a VACUUM INTO
   * snapshot — the checkout must never take a write lock on a store agents
   * write to concurrently, and must stay readable on a read-only open.
   * The snapshot is deleted before returning.
   *
   * The rowid diff runs through an fts5vocab 'instance' table: FTS5 serves
   * plain scans (and count(*)) of an external-content table FROM THE
   * CONTENT TABLE, so ghost rowids are invisible to them; only the
   * vocabulary side reads the index. integrity-check adds internal-
   * structure verification. The repair is NOT a store verb: the hint names
   * the SQL line, executed outside the library (the store is #db-private).
   */
  #checkFts(): DoctorFinding[] {
    const findings: DoctorFinding[] = [];
    const snapshotDir = mkdtempSync(join(tmpdir(), 'souvenance-checkout-'));
    try {
      const snapshotPath = join(snapshotDir, 'snapshot.db').replace(/'/g, "''");
      this.#withBusyRetry(() => this.#db.exec(`VACUUM INTO '${snapshotPath}'`));
      const snapshot = new DatabaseSync(snapshotPath);
      try {
        snapshot.exec("CREATE VIRTUAL TABLE fts_vocab USING fts5vocab('memories_fts', 'instance')");
        const indexRowids = new Set(
          (snapshot.prepare('SELECT DISTINCT doc FROM fts_vocab').all() as { doc: number }[]).map(
            (row) => row.doc,
          ),
        );
        const memoryRowids = (
          snapshot.prepare('SELECT rowid FROM memories').all() as { rowid: number }[]
        ).map((row) => row.rowid);
        // Ghosts show up as an index rowid the content lacks; holes as the
        // reverse. Equal sizes plus full content membership ⇒ identical sets.
        const drifted =
          indexRowids.size !== memoryRowids.length ||
          memoryRowids.some((rowid) => !indexRowids.has(rowid));
        if (drifted) {
          findings.push({
            check: 'fts_integrity',
            detail: `FTS index holds ${indexRowids.size} rowids for ${memoryRowids.length} memories`,
            hint: FTS_REBUILD_HINT,
          });
        }
        try {
          snapshot.exec("INSERT INTO memories_fts(memories_fts) VALUES('integrity-check')");
        } catch (err) {
          findings.push({
            check: 'fts_integrity',
            detail: `integrity-check failed: ${err instanceof Error ? err.message : String(err)}`,
            hint: FTS_REBUILD_HINT,
          });
        }
      } finally {
        snapshot.close();
      }
    } finally {
      rmSync(snapshotDir, { recursive: true, force: true });
    }
    return findings;
  }

  /**
   * The status of one memory, or undefined when absent. BUSY-retried:
   * callers run it outside a transaction (unlink's pre-checks) or inside
   * one where the retry stays a plain read (setHot).
   */
  #readStatus(id: string): MemoryStatus | undefined {
    const row = this.#withBusyRetry(() =>
      this.#db.prepare('SELECT status FROM memories WHERE id = ?').get(id),
    ) as { status: MemoryStatus } | undefined;
    return row?.status;
  }

  /**
   * The outgoing edges of a one-gesture write (StoreOptions.relations).
   * Per-edge validation is link's own — kind non-empty, target exists —
   * and the INSERT is #insertEdge — link's statement, shared verbatim. A
   * self-edge is refused: link's own guard turns them down at the gate
   * (refuse-don't-hide). Runs INSIDE the caller's transaction, so the
   * memory and its edges land atomically or not at all.
   */
  #insertRelations(fromId: string, relations: readonly RelationSpec[], createdAt: string): void {
    for (const relation of relations) {
      if (!relation.kind) throw new Error('kind must be non-empty');
      if (!relation.to) throw new Error('to must be a memory id');
      const targetExists = this.#db.prepare('SELECT 1 FROM memories WHERE id = ?').get(relation.to);
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
    this.#db
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
    const row = this.#db.prepare('SELECT metadata FROM memories WHERE id = ?').get(id) as
      { metadata: string | null } | undefined;
    if (row === undefined) return null;
    return parseRawMetadata(row.metadata);
  }

  /**
   * Structural metadata for a supersede/merge successor built from source
   * metadata: tags union across sources. Kind is NOT here — it is a
   * column from v6 on (#31): supersede inherits it from the source's
   * column (a revision may reclassify), merge inherits on agreement or
   * demands a verdict on disagreement. Explicit options.metadata wins
   * verbatim — inherit happens only when the caller passed no metadata at
   * all. Contextual metadata is never copied — the successor's content
   * describes new state.
   */
  #structuralInherit(
    metadataList: Array<Record<string, unknown> | null>,
  ): Record<string, unknown> | null {
    const tags: unknown[] = [];
    for (const metadata of metadataList) {
      if (!metadata) continue;
      if (Array.isArray(metadata['tags'])) {
        for (const tag of metadata['tags'] as unknown[]) {
          if (!tags.some((existing) => JSON.stringify(existing) === JSON.stringify(tag))) {
            tags.push(tag);
          }
        }
      }
    }
    const structural: Record<string, unknown> = {};
    if (tags.length > 0) structural['tags'] = tags;
    return Object.keys(structural).length > 0 ? structural : null;
  }

  close(): void {
    this.#db.close();
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
