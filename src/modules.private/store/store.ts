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
    if (row === undefined || row.metadata === null) return null;
    try {
      return JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
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
