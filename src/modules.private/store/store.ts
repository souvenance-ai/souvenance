import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrate, SCHEMA_VERSION, schemaVersion } from './migration/migration.ts';

export type UUID = string;

export type MemoryStatus = 'active' | 'superseded' | 'deprecated' | 'merged';

/**
 * One record in a store: content, metadata, a status, and the hot flag —
 * the curation mark that hands the memory to the recover ritual (#12).
 * `hot` is earned after the fact (setHot), never at birth, and survives
 * only on an active memory.
 */
export interface Memory {
  id: UUID;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  status: MemoryStatus;
  hot: boolean;
}

/**
 * A directed edge between two memories (from → to, with a kind). The graph
 * is the single relation surface; reading surfaces project it (#12).
 */
export interface Relation {
  from_id: UUID;
  to_id: UUID;
  kind: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * One outgoing edge authored in the same gesture as the memory itself —
 * the one-gesture write that retires the prose-citation practice. The
 * `link` verb stays for arbitrary edges: reverse directions, retro-fixes,
 * cross-memory repairs.
 */
export interface RelationSpec {
  to: UUID;
  kind: string;
}

export interface StoreOptions {
  metadata?: Record<string, unknown>;
  /**
   * Outgoing edges created in the same call (store: to the new memory;
   * supersede: to the NEW memory — the old→new supersedes edge still
   * happens). Per-edge validation identical to link.
   */
  relations?: RelationSpec[];
}

export interface LinkOptions {
  metadata?: Record<string, unknown>;
}

export interface OpenOptions {
  /**
   * Where the store lives. Required — the path is policy (config, manager),
   * never a silent default the library guesses.
   */
  dbPath: string;
  /**
   * Open for reading only: a missing file is refused (nothing is created),
   * migration is skipped (an out-of-date store is refused — open it
   * read-write once to migrate), and every write verb throws.
   */
  readOnly?: boolean;
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
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (existsSync(p)) chmodSync(p, 0o600);
    } catch {
      // best effort — the doctor reports drift
    }
  }
}

function execPragma(db: DatabaseSync): void {
  // busy_timeout MUST come first: PRAGMA journal_mode = WAL grabs an exclusive
  // file-header lock when the store is fresh (or unwal'd). With the busy handler
  // unset, any racing open loses that grab immediately with SQLITE_BUSY.
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
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

  private constructor(db: DatabaseSync, dbPath: string, readOnly: boolean) {
    this.db = db;
    this.dbPath = dbPath;
    this.readOnly = readOnly;
  }

  static open(opts: OpenOptions): Store {
    const dbPath = resolve(opts.dbPath);
    if (opts.readOnly === true) {
      // A read-only open creates nothing and migrates nothing: the store is
      // served exactly as its owner left it, and refused if it is missing
      // or speaks an older schema than this library.
      if (!existsSync(dbPath)) {
        throw new Error(`no store at ${dbPath}`);
      }
      const db = new DatabaseSync(dbPath, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 5000');
      db.exec('PRAGMA foreign_keys = ON');
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
   * Write verbs refuse on a read-only store. NOT enforced inside run():
   * run() also carries legitimate non-write uses (the doctor's VACUUM INTO
   * snapshot lands there in #13).
   */
  private assertWritable(): void {
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
  private requireActive(id: string, verb: string): boolean {
    const row = this.db.prepare('SELECT status, hot FROM memories WHERE id = ?').get(id) as
      { status: string; hot: number } | undefined;
    if (!row) throw new Error(`memory not found: ${id}`);
    if (row.status !== 'active') {
      throw new Error(`cannot ${verb} a memory with status '${row.status}'`);
    }
    return row.hot === 1;
  }

  /**
   * Store a memory: UUID id, metadata JSON, born cold — the hot flag is
   * earned after the fact (setHot), never at birth. The one-gesture
   * relations land in the same transaction: the memory and its edges
   * arrive together or not at all.
   */
  store(content: string, opts: StoreOptions = {}): string {
    this.assertWritable();
    if (!content) throw new Error('content must be non-empty');
    const id = randomUUID();
    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db.exec('BEGIN');
      try {
        this.db
          .prepare('INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)')
          .run(id, content, metadata, created_at);
        if (opts.relations?.length) {
          this.insertRelations(id, opts.relations, created_at);
        }
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
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
  supersede(oldId: string, content: string, opts: StoreOptions = {}): string {
    this.assertWritable();
    if (!content) throw new Error('content must be non-empty');
    const newId = randomUUID();
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db.exec('BEGIN');
      try {
        const hot = this.requireActive(oldId, 'supersede');
        const inherited = opts.metadata ?? this.structuralInherit([this.readMeta(oldId)]);
        const metadata = inherited ? JSON.stringify(inherited) : null;
        this.db
          .prepare(
            'INSERT INTO memories (id, content, metadata, created_at, hot) VALUES (?, ?, ?, ?, ?)',
          )
          .run(newId, content, metadata, created_at, hot ? 1 : 0);
        if (!opts.relations?.length) {
          const inherited = this.db
            .prepare('SELECT to_id, kind, metadata, created_at FROM edges WHERE from_id = ?')
            .all(oldId) as unknown as Array<{
            to_id: string;
            kind: string;
            metadata: string | null;
            created_at: string;
          }>;
          const existsStmt = this.db.prepare('SELECT 1 FROM memories WHERE id = ?');
          const edgeStmt = this.db.prepare(
            'INSERT OR IGNORE INTO edges' +
              ' (from_id, to_id, kind, metadata, created_at)' +
              ' VALUES (?, ?, ?, ?, ?)',
          );
          for (const e of inherited) {
            // Pre-validated like insertRelations: refuse-don't-hide — a
            // hand-corrupted orphan source edge names its missing target
            // precisely instead of failing an FK message, and the
            // ROLLBACK keeps the old memory active and unbridged.
            if (!existsStmt.get(e.to_id)) {
              throw new Error(`memory not found: ${e.to_id}`);
            }
            edgeStmt.run(newId, e.to_id, e.kind, e.metadata, e.created_at);
          }
        }
        // The one-gesture relations are the NEW memory's outgoing edges —
        // the ritual citation "link it right after storing" dies here.
        if (opts.relations?.length) {
          this.insertRelations(newId, opts.relations, created_at);
        }
        this.db
          .prepare(
            'INSERT OR IGNORE INTO edges' +
              ' (from_id, to_id, kind, metadata, created_at)' +
              ' VALUES (?, ?, ?, ?, ?)',
          )
          .run(oldId, newId, 'supersedes', null, created_at);
        this.db
          .prepare("UPDATE memories SET status = 'superseded', hot = 0 WHERE id = ?")
          .run(oldId);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
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
  merge(ids: string[], content: string, opts: StoreOptions = {}): string {
    this.assertWritable();
    if (ids.length < 2) throw new Error('merge requires at least 2 memories');
    if (!content) throw new Error('content must be non-empty');
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`duplicate id in merge: ${id}`);
      seen.add(id);
    }
    const newId = randomUUID();
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db.exec('BEGIN');
      try {
        const metas: Array<Record<string, unknown> | null> = [];
        let hot = false;
        for (const id of ids) {
          if (this.requireActive(id, 'merge')) hot = true;
          metas.push(this.readMeta(id));
        }
        const inherited = opts.metadata ?? this.structuralInherit(metas);
        const metadata = inherited ? JSON.stringify(inherited) : null;
        this.db
          .prepare(
            'INSERT INTO memories (id, content, metadata, created_at, hot) VALUES (?, ?, ?, ?, ?)',
          )
          .run(newId, content, metadata, created_at, hot ? 1 : 0);
        for (const id of ids) {
          this.db
            .prepare(
              'INSERT OR IGNORE INTO edges' +
                ' (from_id, to_id, kind, metadata, created_at)' +
                ' VALUES (?, ?, ?, ?, ?)',
            )
            .run(id, newId, 'merges', null, created_at);
          this.db.prepare("UPDATE memories SET status = 'merged', hot = 0 WHERE id = ?").run(id);
        }
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    });
    return newId;
  }

  /**
   * End a memory deliberately: deprecated stays in the store (history is
   * never rewritten), cools, and refuses any further write gesture. There
   * is no delete — persistent memory obliges.
   */
  deprecate(id: string): void {
    this.assertWritable();
    this.run(() => {
      this.requireActive(id, 'deprecate');
      this.db.prepare("UPDATE memories SET status = 'deprecated', hot = 0 WHERE id = ?").run(id);
    });
  }

  /**
   * The one non-graph mutation: curation. Only an ACTIVE memory can be
   * hot — the flag hands the memory to the recover ritual (#12), and a
   * superseded/deprecated/merged memory must not resurface through it.
   * Status transitions cool the memory; this is the only way back.
   */
  setHot(id: string, hot: boolean): void {
    this.assertWritable();
    this.run(() => {
      const row = this.db.prepare('SELECT status FROM memories WHERE id = ?').get(id) as
        { status: string } | undefined;
      if (!row) throw new Error(`memory not found: ${id}`);
      if (row.status !== 'active') {
        throw new Error(`cannot hot a memory with status '${row.status}'`);
      }
      this.db.prepare('UPDATE memories SET hot = ? WHERE id = ?').run(hot ? 1 : 0, id);
    });
  }

  /**
   * Create a typed directed edge — the retro-fix, reverse-direction,
   * cross-memory repair gesture (one-gesture writes use StoreOptions
   * relations). Idempotent per (from, to, kind).
   */
  link(fromId: string, toId: string, kind: string, opts: LinkOptions = {}): void {
    this.assertWritable();
    if (!kind) throw new Error('kind must be non-empty');
    const fromExists = this.run(() =>
      this.db.prepare('SELECT 1 FROM memories WHERE id = ?').get(fromId),
    );
    if (!fromExists) throw new Error(`memory not found: ${fromId}`);
    const toExists = this.run(() =>
      this.db.prepare('SELECT 1 FROM memories WHERE id = ?').get(toId),
    );
    if (!toExists) throw new Error(`memory not found: ${toId}`);

    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO edges' +
            ' (from_id, to_id, kind, metadata, created_at)' +
            ' VALUES (?, ?, ?, ?, ?)',
        )
        .run(fromId, toId, kind, metadata, created_at);
    });
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
    this.assertWritable();
    // Endpoint existence first: a missing memory can hold no edge, and the
    // transposed-id mistake (the lived failure behind this verb) reads as a
    // precise endpoint error instead of a bare "edge not found".
    const fromStatus = this.readStatus(fromId);
    if (!fromStatus) throw new Error(`memory not found: ${fromId}`);
    const toStatus = this.readStatus(toId);
    if (!toStatus) throw new Error(`memory not found: ${toId}`);
    if (fromStatus !== 'active') {
      throw new Error(`cannot unlink a memory with status '${fromStatus}'`);
    }
    if (toStatus !== 'active') {
      throw new Error(`cannot unlink a memory with status '${toStatus}'`);
    }

    if (kind !== undefined) {
      if (!kind) throw new Error('kind must be non-empty');
      const result = this.run(() =>
        this.db
          .prepare('DELETE FROM edges WHERE from_id = ? AND to_id = ? AND kind = ?')
          .run(fromId, toId, kind),
      );
      if (result.changes === 0) {
        throw new Error(`edge not found: ${fromId} -> ${toId} (${kind})`);
      }
      return;
    }

    const directed = this.run(() =>
      this.db
        .prepare('SELECT kind FROM edges WHERE from_id = ? AND to_id = ? ORDER BY kind')
        .all(fromId, toId),
    ) as Array<{ kind: string }>;
    if (directed.length === 1) {
      this.run(() =>
        this.db
          .prepare('DELETE FROM edges WHERE from_id = ? AND to_id = ? AND kind = ?')
          .run(fromId, toId, directed[0]!.kind),
      );
      return;
    }
    if (directed.length === 0) {
      const reverse = this.run(() =>
        this.db
          .prepare('SELECT kind FROM edges WHERE from_id = ? AND to_id = ? ORDER BY kind')
          .all(toId, fromId),
      ) as Array<{ kind: string }>;
      if (reverse.length > 0) {
        const list = reverse.map((e) => `${toId} -> ${fromId} (${e.kind})`).join(', ');
        throw new Error(
          `edge not found: ${fromId} -> ${toId}; edges exist in the reverse direction: ${list}`,
        );
      }
      throw new Error(`edge not found: ${fromId} -> ${toId}`);
    }
    const kinds = directed.map((e) => e.kind).join(', ');
    throw new Error(
      `ambiguous: ${directed.length} edges between ${fromId} and ${toId}, pass --kind: ${kinds}`,
    );
  }

  /** The status of one memory, or undefined when absent. */
  private readStatus(id: string): string | undefined {
    const row = this.db.prepare('SELECT status FROM memories WHERE id = ?').get(id) as
      { status: string } | undefined;
    return row?.status;
  }

  /**
   * The outgoing edges of a one-gesture write (StoreOptions.relations).
   * Per-edge validation is link's own — kind non-empty, target exists —
   * and the INSERT is link's statement verbatim (no duplicate SQL). A
   * self-edge is left to land: the doctor's self_edges check is the
   * visible enforcer, the write is not smarter than the graph. Runs
   * INSIDE the caller's transaction, so the memory and its edges land
   * atomically or not at all.
   */
  private insertRelations(fromId: string, relations: RelationSpec[], createdAt: string): void {
    for (const rel of relations) {
      if (!rel.kind) throw new Error('kind must be non-empty');
      if (!rel.to) throw new Error('to must be a memory id');
      const toExists = this.db.prepare('SELECT 1 FROM memories WHERE id = ?').get(rel.to);
      if (!toExists) throw new Error(`memory not found: ${rel.to}`);
    }
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, NULL, ?)',
    );
    for (const rel of relations) {
      stmt.run(fromId, rel.to, rel.kind, createdAt);
    }
  }

  /**
   * Raw metadata of one memory, parsed; null when the row is absent or the
   * column is null. Internal helper for successor construction — never
   * surfaces to callers.
   */
  private readMeta(id: string): Record<string, unknown> | null {
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
   * sources. Explicit opts.metadata wins verbatim — inherit happens only when
   * the caller passed no metadata at all. Rationale: kind is what the CLI's
   * read filters select on; a kind-less successor silently drops out of those
   * filters (observed defect October 2026, caught by the cold-reader re-test).
   * Contextual metadata is never copied — the successor's content describes
   * new state.
   */
  private structuralInherit(
    metas: Array<Record<string, unknown> | null>,
  ): Record<string, unknown> | null {
    const kinds = new Set<unknown>();
    const tags: unknown[] = [];
    for (const meta of metas) {
      if (!meta) continue;
      if ('kind' in meta && meta['kind'] !== undefined) kinds.add(meta['kind']);
      if (Array.isArray(meta['tags'])) {
        for (const t of meta['tags'] as unknown[]) {
          if (!tags.some((x) => JSON.stringify(x) === JSON.stringify(t))) {
            tags.push(t);
          }
        }
      }
    }
    const out: Record<string, unknown> = {};
    if (kinds.size === 1) out['kind'] = [...kinds][0];
    if (tags.length > 0) out['tags'] = tags;
    return Object.keys(out).length > 0 ? out : null;
  }

  close(): void {
    this.db.close();
  }

  /**
   * Run a write that may hit SQLITE_BUSY under concurrent WAL access.
   * Retries with a short delay until `BUSY_RETRIES` is exhausted.
   */
  run<T>(fn: () => T): T {
    let lastErr: unknown;
    for (let attempt = 0; attempt < BUSY_RETRIES; attempt++) {
      try {
        return fn();
      } catch (err) {
        if (
          err instanceof Error &&
          'errcode' in err &&
          (err as { errcode: number }).errcode === SQLITE_BUSY
        ) {
          lastErr = err;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, BUSY_DELAY_MS);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }
}
