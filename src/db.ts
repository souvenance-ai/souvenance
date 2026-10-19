import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { migrate, SCHEMA_VERSION, schemaVersion } from "./migrations.ts";
import type {
  StoreOptions,
  UpdateOptions,
  SearchOptions,
  ListOptions,
  TagsOptions,
  RelationsOptions,
  ForkOptions,
  ForkResult,
  Direction,
  Memory,
  MemoryStatus,
  Relation,
  Stats,
  SearchResult,
  TagCount,
  DoctorFinding,
  DoctorOptions,
  DoctorReport,
  FinishFinding,
  FinishReport,
} from "./types.ts";

export const DEFAULT_DB_PATH = ".ai-memory/memory.db";

/** memory:// links are authored text in content; the doctor validates each target. */
const MEMORY_LINK_RE = /memory:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

const DOCTOR_CHECK_COUNT = 10;

/** Closing-ritual window: when the session stored memories, a summary and an
 *  experience note must exist within this window. 24h covers every lived
 *  session so far; the timeless doctor checks (stale_handoff et al.) catch
 *  what a fixed window cannot. */
const FINISH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The dream volume line: +10 new memories since the last dream blocks the
 *  verdict outright; below it the session-end clause stays a visible warn
 *  (the agent's judgment debt, paid or argued aloud — never silent). */
const DREAM_VOLUME_LINE = 10;

const SQLITE_BUSY = 5;
const BUSY_RETRIES = 50;
const BUSY_DELAY_MS = 20;

interface MemoryRow {
  id: string;
  content: string;
  metadata: string | null;
  created_at: string;
  status: string;
  weight: number;
  access_count: number;
}

interface SearchRow {
  id: string;
  content: string;
  metadata: string | null;
  created_at: string;
  status: string;
  weight: number;
  access_count: number;
  rank: number;
}

interface RelationRow {
  from_id: string;
  to_id: string;
  kind: string;
  metadata: string | null;
  created_at: string;
}

function parseMemoryRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    created_at: row.created_at,
    status: row.status as MemoryStatus,
    weight: row.weight,
    access_count: row.access_count,
  };
}

function parseSearchRow(row: SearchRow): SearchResult {
  return {
    id: row.id,
    content: row.content,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    created_at: row.created_at,
    status: row.status as MemoryStatus,
    weight: row.weight,
    access_count: row.access_count,
    rank: row.rank,
  };
}

function parseRelationRow(row: RelationRow): Relation {
  return {
    from_id: row.from_id,
    to_id: row.to_id,
    kind: row.kind,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    created_at: row.created_at,
  };
}

export interface OpenOptions {
  /** Override the default `.ai-memory/memory.db` path. */
  dbPath?: string;
  /**
   * Open for reading only: a missing file is refused (nothing is created),
   * migration is skipped (an out-of-date store is refused — open it
   * read-write once to migrate), and every write verb throws.
   */
  readOnly?: boolean;
}

function execPragma(db: DatabaseSync): void {
  // busy_timeout MUST come first: PRAGMA journal_mode = WAL grabs an exclusive
  // file-header lock when the store is fresh (or unwal'd). With the busy handler
  // unset, any racing open loses that grab immediately with SQLITE_BUSY.
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
}

export class Store {
  readonly db: DatabaseSync;
  readonly dbPath: string;
  /** True when opened with readOnly — write verbs refuse, migration is
   *  skipped, and the read-signal (access_count) does not bump. */
  readonly readOnly: boolean;

  private constructor(db: DatabaseSync, dbPath: string, readOnly: boolean) {
    this.db = db;
    this.dbPath = dbPath;
    this.readOnly = readOnly;
  }

  static open(opts: OpenOptions = {}): Store {
    const dbPath = resolve(opts.dbPath ?? DEFAULT_DB_PATH);
    if (opts.readOnly === true) {
      // A read-only open creates nothing and migrates nothing: the store is
      // served exactly as its owner left it, and refused if it is missing
      // or speaks an older schema than this library.
      if (!existsSync(dbPath)) {
        throw new Error(`no store at ${dbPath}`);
      }
      const db = new DatabaseSync(dbPath, { readOnly: true });
      db.exec("PRAGMA busy_timeout = 5000");
      db.exec("PRAGMA foreign_keys = ON");
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
    return new Store(db, dbPath, false);
  }

  /**
   * Write verbs refuse on a read-only store. NOT enforced inside run():
   * run() also carries legitimate non-write uses — the read-signal
   * access_count bumps and the doctor's VACUUM INTO snapshot.
   */
  private assertWritable(): void {
    if (this.readOnly) {
      throw new Error(
        "store is read-only (opened with readOnly: true); writes are refused",
      );
    }
  }

  private assertActive(id: string, verb: string): void {
    const row = this.db
      .prepare("SELECT status FROM memories WHERE id = ?")
      .get(id) as { status: string } | undefined;
    if (!row) throw new Error(`memory not found: ${id}`);
    if (row.status !== "active") {
      throw new Error(`cannot ${verb} a memory with status '${row.status}'`);
    }
  }

  store(content: string, opts: StoreOptions = {}): string {
    this.assertWritable();
    if (!content) throw new Error("content must be non-empty");
    const id = randomUUID();
    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const weight = opts.weight ?? 0.5;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db
        .prepare(
          "INSERT INTO memories (id, content, metadata, created_at, weight) VALUES (?, ?, ?, ?, ?)",
        )
        .run(id, content, metadata, created_at, weight);
    });
    return id;
  }

  supersede(
    oldId: string,
    content: string,
    opts: StoreOptions = {},
  ): string {
    this.assertWritable();
    if (!content) throw new Error("content must be non-empty");
    const newId = randomUUID();
    const weight = opts.weight ?? 0.5;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db.exec("BEGIN");
      try {
        this.assertActive(oldId, "supersede");
        const metadata = JSON.stringify(
          opts.metadata ??
            this.structuralInherit([this.readMeta(oldId)]),
        );
        this.db
          .prepare(
            "INSERT INTO memories (id, content, metadata, created_at, weight) VALUES (?, ?, ?, ?, ?)",
          )
          .run(newId, content, metadata, created_at, weight);
        this.db
          .prepare(
            "INSERT OR IGNORE INTO edges" +
              " (from_id, to_id, kind, metadata, created_at)" +
              " VALUES (?, ?, ?, ?, ?)",
          )
          .run(oldId, newId, "supersedes", null, created_at);
        this.db
          .prepare("UPDATE memories SET status = 'superseded' WHERE id = ?")
          .run(oldId);
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    });
    return newId;
  }

  merge(
    ids: string[],
    content: string,
    opts: StoreOptions = {},
  ): string {
    this.assertWritable();
    if (ids.length < 2) throw new Error("merge requires at least 2 memories");
    if (!content) throw new Error("content must be non-empty");
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`duplicate id in merge: ${id}`);
      seen.add(id);
    }
    const newId = randomUUID();
    const weight = opts.weight ?? 0.5;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db.exec("BEGIN");
      try {
        const metas: Array<Record<string, unknown> | null> = [];
        for (const id of ids) {
          this.assertActive(id, "merge");
          metas.push(this.readMeta(id));
        }
        const metadata = JSON.stringify(
          opts.metadata ?? this.structuralInherit(metas),
        );
        this.db
          .prepare(
            "INSERT INTO memories (id, content, metadata, created_at, weight) VALUES (?, ?, ?, ?, ?)",
          )
          .run(newId, content, metadata, created_at, weight);
        for (const id of ids) {
          this.db
            .prepare(
              "INSERT OR IGNORE INTO edges" +
                " (from_id, to_id, kind, metadata, created_at)" +
                " VALUES (?, ?, ?, ?, ?)",
            )
            .run(id, newId, "merges", null, created_at);
          this.db
            .prepare("UPDATE memories SET status = 'merged' WHERE id = ?")
            .run(id);
        }
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    });
    return newId;
  }

  update(id: string, opts: UpdateOptions = {}): void {
    this.assertWritable();
    // Pre-check reads are wrapped: under concurrent writers they can transiently
    // hit SQLITE_BUSY, and unwrapped they would abort with 'database is locked'.
    const existing = this.run(() =>
      this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(id),
    );
    if (!existing) throw new Error(`memory not found: ${id}`);
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (opts.metadata !== undefined) {
      sets.push("metadata = ?");
      params.push(JSON.stringify(opts.metadata));
    }
    if (opts.weight !== undefined) {
      sets.push("weight = ?");
      params.push(opts.weight);
    }
    if (sets.length === 0) throw new Error("update requires at least one of metadata or weight");
    params.push(id);
    this.run(() => {
      this.db
        .prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`)
        .run(...params);
    });
  }

  delete(id: string): void {
    this.assertWritable();
    const existing = this.run(() =>
      this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(id),
    );
    if (!existing) throw new Error(`memory not found: ${id}`);
    this.run(() => {
      this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    });
  }

  deprecate(id: string): void {
    this.assertWritable();
    this.run(() => this.assertActive(id, "deprecate"));
    this.run(() => {
      this.db
        .prepare("UPDATE memories SET status = 'deprecated' WHERE id = ?")
        .run(id);
    });
  }

  link(
    fromId: string,
    toId: string,
    kind: string,
    opts: StoreOptions = {},
  ): void {
    this.assertWritable();
    if (!kind) throw new Error("kind must be non-empty");
    const fromExists = this.run(() =>
      this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(fromId),
    );
    if (!fromExists) throw new Error(`memory not found: ${fromId}`);
    const toExists = this.run(() =>
      this.db.prepare("SELECT 1 FROM memories WHERE id = ?").get(toId),
    );
    if (!toExists) throw new Error(`memory not found: ${toId}`);

    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO edges" +
            " (from_id, to_id, kind, metadata, created_at)" +
            " VALUES (?, ?, ?, ?, ?)",
        )
        .run(fromId, toId, kind, metadata, created_at);
    });
  }
  /**
   * Bulk read for export/dump operations; not part of the stable API.
   * Yields all memories and edges lazily as lazy iterators.
   */
  dump(): { memories: IterableIterator<Memory>; edges: IterableIterator<Relation> } {
    const memStmt = this.db.prepare(
      "SELECT id, content, metadata, created_at, status, weight, access_count FROM memories ORDER BY created_at ASC",
    );
    const edgeStmt = this.db.prepare(
      "SELECT from_id, to_id, kind, metadata, created_at FROM edges ORDER BY created_at ASC",
    );
    const memories = (function* () {
      for (const row of memStmt.iterate() as unknown as IterableIterator<MemoryRow>) {
        yield parseMemoryRow(row);
      }
    })();
    const edges = (function* () {
      for (const row of edgeStmt.iterate() as unknown as IterableIterator<RelationRow>) {
        yield parseRelationRow(row);
      }
    })();
    return { memories, edges };
  }

  close(): void {
    this.db.close();
  }

  /**
   * Fork the store: an exact copy at targetPath — the mitosis primitive
   * of the fork model (a store is an individual; forks never re-sync).
   * The copy is a VACUUM INTO snapshot: safe under concurrent WAL writers,
   * compacted, FTS index included — and NOTHING is added to it. A fork that
   * should know its origin gets told by its forker, in the forker's own
   * words: store a memory in the child after the copy (the tool does not
   * presume the narrative — archive, gift, sandbox, product seed). Fork
   * never writes to the parent, so it is allowed on a read-only open: an
   * archive can be forked without waking it. Restoring a dormant fork is
   * rebirth, never resync. Backup scheduling and transport stay outside the
   * library — this is the copy primitive only.
   */
  fork(targetPath: string, opts: ForkOptions = {}): ForkResult {
    const target = resolve(targetPath);
    if (existsSync(target) && !opts.force) {
      throw new Error(
        `fork target already exists: ${target} (pass force to overwrite)`,
      );
    }
    if (opts.force) {
      // VACUUM INTO refuses an existing target; a forced refresh removes the
      // old file and its WAL sidecars first.
      for (const p of [target, `${target}-wal`, `${target}-shm`]) {
        rmSync(p, { force: true });
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    // Reporting counts, read on this connection right before the snapshot:
    // the copied rows are exactly these (a concurrent commit in between
    // could skew the report, never the copy itself).
    const memories = (
      this.db.prepare("SELECT count(*) AS c FROM memories").get() as { c: number }
    ).c;
    const edges = (
      this.db.prepare("SELECT count(*) AS c FROM edges").get() as { c: number }
    ).c;
    const quoted = target.replace(/'/g, "''");
    this.run(() => this.db.exec(`VACUUM INTO '${quoted}'`));
    return { path: target, memories, edges };
  }

  search(query: string, opts: SearchOptions = {}): SearchResult[] {
    if (!query) throw new Error("query must be non-empty");
    const limit = opts.limit ?? 20;
    let sql = `SELECT m.id, m.content, m.metadata, m.created_at, m.status, m.weight, m.access_count,` +
      ` (bm25(memories_fts) * m.weight * (1.0 / (1.0 + (julianday('now') - julianday(m.created_at)))) * (1.0 + ln(m.access_count + 1) * 0.1)) AS rank` +
      ` FROM memories_fts f` +
      ` JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?`;
    const params: (string | number)[] = [];
    if (!opts.includeLegacy) {
      sql += ` AND m.status = 'active'`;
    }
    if (opts.where) {
      sql += ` AND ${opts.where}`;
    }
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);
    const runQuery = (match: string): SearchResult[] => {
      const rows = this.db.prepare(sql).all(match, ...params) as unknown as SearchRow[];
      const results = rows.map(parseSearchRow);
      // The read-signal is a write (access_count bump); on a read-only
      // store a read stays a read — the signal is skipped, not lost data.
      if (results.length > 0 && !this.readOnly) {
        const fraction = 1.0 / results.length;
        this.run(() => {
          const stmt = this.db.prepare("UPDATE memories SET access_count = access_count + ? WHERE id = ?");
          for (const r of results) {
            stmt.run(fraction, r.id);
          }
        });
      }
      return results;
    };
    try {
      return runQuery(query);
    } catch (err) {
      // FTS5 rejects punctuation in bare tokens (dotted numerics like "0.9",
      // hyphenated or colonated identifiers). Dotted numerics raise
      // "fts5: syntax error"; hyphenated/colonated compounds make FTS5 treat
      // the tail as a column filter and raise "no such column: <tail>".
      // A "no such column" whose name is not part of the query is a plain
      // SQL problem (e.g. a bad --where) and must keep surfacing.
      if (ftsErrorFromQuery(err, query)) {
        const sanitized = sanitizeFtsQuery(query);
        if (sanitized) return runQuery(sanitized);
      }
      throw err;
    }
  }

  get(id: string): Memory | null {
    const row = this.db
      .prepare("SELECT id, content, metadata, created_at, status, weight, access_count FROM memories WHERE id = ?")
      .get(id) as unknown as MemoryRow | undefined;
    if (!row) return null;
    if (!this.readOnly) {
      this.run(() => {
        this.db
          .prepare("UPDATE memories SET access_count = access_count + 1 WHERE id = ?")
          .run(id);
      });
    }
    return parseMemoryRow(row);
  }

  list(opts: ListOptions = {}): Memory[] {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    let sql = `SELECT id, content, metadata, created_at, status, weight, access_count FROM memories`;
    const params: (string | number)[] = [];
    const conditions: string[] = [];
    if (!opts.includeLegacy) {
      conditions.push("status = 'active'");
    }
    if (opts.where) {
      conditions.push(opts.where);
    }
    if (opts.minWeight !== undefined) {
      conditions.push("weight >= ?");
      params.push(opts.minWeight);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = this.db.prepare(sql).all(...params) as unknown as MemoryRow[];
    return rows.map(parseMemoryRow);
  }

  relations(id: string, opts: RelationsOptions = {}): Relation[] {
    const existing = this.db
      .prepare("SELECT 1 FROM memories WHERE id = ?")
      .get(id);
    if (!existing) throw new Error(`memory not found: ${id}`);

    const direction: Direction = opts.direction ?? "both";
    const rows: RelationRow[] = [];

    if (direction === "out" || direction === "both") {
      const outRows = this.db
        .prepare(
          `SELECT from_id, to_id, kind, metadata, created_at FROM edges` +
            ` WHERE from_id = ? ORDER BY created_at DESC`,
        )
        .all(id) as unknown as RelationRow[];
      rows.push(...outRows);
    }

    if (direction === "in" || direction === "both") {
      const inRows = this.db
        .prepare(
          `SELECT from_id, to_id, kind, metadata, created_at FROM edges` +
            ` WHERE to_id = ? ORDER BY created_at DESC`,
        )
        .all(id) as unknown as RelationRow[];
      rows.push(...inRows);
    }

    const relations = rows.map(parseRelationRow);
    if (opts.resolve) {
      for (const rel of relations) {
        const terminal = this.resolveChain(rel.to_id);
        // Annotate only when the raw target is not already the current
        // version: active targets and unresolvable chains stay bare.
        if (terminal && terminal !== rel.to_id) rel.resolved_to = terminal;
      }
    }
    return relations;
  }

  /**
   * Follow the unique supersedes/merges bridge out of a superseded/merged
   * memory until the chain reaches an active memory. Returns undefined when
   * there is no successor: dangling id, deprecated target (a termination,
   * not a replacement), or a bridged chain cut off. Chains are linear by
   * construction — supersede and merge both demand an active source and
   * create exactly one bridge old→new — so this loop always terminates; the
   * seen set only defends against a store whose rows were edited by hand.
   */
  private resolveChain(startId: string): string | undefined {
    const statusStmt = this.db.prepare(
      "SELECT status FROM memories WHERE id = ?",
    );
    const bridgeStmt = this.db.prepare(
      "SELECT to_id FROM edges" +
        " WHERE from_id = ? AND kind IN ('supersedes', 'merges')" +
        " ORDER BY created_at DESC LIMIT 1",
    );
    const seen = new Set<string>();
    let current: string | undefined = startId;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      const row = statusStmt.get(current) as { status: string } | undefined;
      if (!row) return undefined;
      if (row.status === "active") return current;
      if (row.status !== "superseded" && row.status !== "merged") return undefined;
      const bridge = bridgeStmt.get(current) as { to_id: string } | undefined;
      current = bridge?.to_id;
    }
    return undefined;
  }

  /**
   * Raw metadata of one memory, parsed; null when the row is absent or the
   * column is null. Internal helper for successor construction — never bumps
   * access_count.
   */
  private readMeta(id: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT metadata FROM memories WHERE id = ?")
      .get(id) as { metadata: string | null } | undefined;
    if (row === undefined || row.metadata === null) return null;
    try {
      return JSON.parse(row.metadata);
    } catch {
      return null;
    }
  }

  /**
   * Structural metadata for a supersede/merge successor built from source
   * metadata: kind carries only when every source agrees, tags union across
   * sources. Explicit opts.metadata wins verbatim — inherit happens only when
   * the caller passed no metadata at all. Rationale: kind is what the CLI's
   * read filters select on (directives, decisions, summaries); a kind-less
   * successor silently drops out of those rituals (observed defect October
   * 2026, caught by the cold-reader re-test). Contextual metadata is never
   * copied — the successor's content describes new state.
   */
  private structuralInherit(
    metas: Array<Record<string, unknown> | null>,
  ): Record<string, unknown> | null {
    const kinds = new Set<unknown>();
    const tags: unknown[] = [];
    for (const meta of metas) {
      if (!meta) continue;
      if ("kind" in meta && meta["kind"] !== undefined) kinds.add(meta["kind"]);
      if (Array.isArray(meta["tags"])) {
        for (const t of meta["tags"] as unknown[]) {
          if (!tags.some((x) => JSON.stringify(x) === JSON.stringify(t))) {
            tags.push(t);
          }
        }
      }
    }
    const out: Record<string, unknown> = {};
    if (kinds.size === 1) out["kind"] = [...kinds][0];
    if (tags.length > 0) out["tags"] = tags;
    return Object.keys(out).length > 0 ? out : null;
  }

  stats(): Stats {
    const memCount = this.db
      .prepare("SELECT count(*) AS c FROM memories")
      .get() as { c: number };
    const activeCount = this.db
      .prepare("SELECT count(*) AS c FROM memories WHERE status = 'active'")
      .get() as { c: number };
    const statusRows = this.db
      .prepare("SELECT status, count(*) AS c FROM memories GROUP BY status ORDER BY status")
      .all() as { status: string; c: number }[];
    const memories_by_status: Record<string, number> = {};
    for (const row of statusRows) {
      memories_by_status[row.status] = row.c;
    }
    const edgeCount = this.db
      .prepare("SELECT count(*) AS c FROM edges")
      .get() as { c: number };
    const readsRow = this.db
      .prepare("SELECT COALESCE(sum(access_count), 0) AS c FROM memories")
      .get() as { c: number };
    const kindRows = this.db
      .prepare("SELECT kind, count(*) AS c FROM edges GROUP BY kind ORDER BY kind")
      .all() as { kind: string; c: number }[];
    const edges_by_kind: Record<string, number> = {};
    for (const row of kindRows) {
      edges_by_kind[row.kind] = row.c;
    }
    return {
      memories: memCount.c,
      active_memories: activeCount.c,
      memories_by_status,
      edges: edgeCount.c,
      edges_by_kind,
      total_accesses: readsRow.c,
    };
  }

  tags(opts: TagsOptions = {}): TagCount[] {
    let sql = `SELECT json_each.value AS tag, count(*) AS count
               FROM memories, json_each(metadata->'$.tags')
               WHERE metadata IS NOT NULL
                 AND json_type(metadata->'$.tags') = 'array'`;
    if (!opts.includeLegacy) {
      sql += ` AND status = 'active'`;
    }
    if (opts.where) {
      sql += ` AND ${opts.where}`;
    }
    sql += ` GROUP BY tag ORDER BY count DESC, tag ASC`;
    const rows = this.db.prepare(sql).all() as { tag: string; count: number }[];
    return rows;
  }

  /**
   * Validate the store's own integrity and report findings with one-line
   * remediation hints. Diagnoses only: content repairs stay supersede/merge
   * decisions; the single mechanical exception is opts.fix, which rebuilds
   * the FTS5 index before checking. The report is ordered by check (see
   * .scratch/memory-doctor/issues/01 for the per-check contract).
   */
  doctor(opts: DoctorOptions = {}): DoctorReport {
    const findings: DoctorFinding[] = [];
    if (opts.fix) {
      this.assertWritable();
      this.run(() => {
        this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
      });
    }

    const mems = this.db
      .prepare("SELECT id, content, metadata, created_at, status, weight, access_count FROM memories")
      .all() as unknown as MemoryRow[];
    const edges = this.db
      .prepare("SELECT from_id, to_id, kind, metadata, created_at FROM edges")
      .all() as unknown as RelationRow[];
    const byId = new Map(mems.map((m) => [m.id, m]));

    // Parse metadata once; broken_links/orphan checks need ids, kind/weight
    // checks need parsed metadata, invalid-JSON needs the parse failure itself.
    const parsedMeta = new Map<string, Record<string, unknown> | null>();
    for (const m of mems) {
      if (m.metadata === null) {
        parsedMeta.set(m.id, null);
        continue;
      }
      try {
        parsedMeta.set(m.id, JSON.parse(m.metadata) as Record<string, unknown>);
      } catch {
        parsedMeta.set(m.id, undefined as unknown as Record<string, unknown>);
      }
    }

    for (const m of mems) {
      for (const match of m.content.matchAll(MEMORY_LINK_RE)) {
        if (!byId.has(match[1])) {
          findings.push({
            check: "broken_links",
            id: m.id,
            detail: `content references memory://${match[1]} which is not in the store`,
            hint: "supersede with corrected content, or deprecate the source memory",
          });
        }
      }
    }

    for (const e of edges) {
      if (!byId.has(e.from_id) || !byId.has(e.to_id)) {
        findings.push({
          check: "orphan_edges",
          detail: `edge ${e.from_id} -> ${e.to_id} (${e.kind}) references a missing memory`,
          hint: "the store was edited outside the CLI; restore the missing memory or remove the edge with direct SQL",
        });
      }
    }

    for (const m of mems) {
      if (m.status !== "active") continue;
      const parsed = parsedMeta.get(m.id);
      // Invalid JSON is already reported by invalid_metadata_json — one
      // finding per root cause, not two for the same corruption.
      if (parsed === undefined) continue;
      const kind =
        parsed !== null && typeof parsed["kind"] === "string" ? (parsed["kind"] as string) : undefined;
      if (m.metadata === null || !kind) {
        findings.push({
          check: "active_without_kind",
          id: m.id,
          detail:
            m.metadata === null
              ? "active memory has null metadata"
              : "active memory metadata carries no kind",
          hint: 'memory update --metadata \'{"kind":"note"}\' restores ritual visibility',
        });
      }
    }

    for (const m of mems) {
      if (m.status !== "active") continue;
      const parsed = parsedMeta.get(m.id);
      const kind =
        parsed && typeof parsed["kind"] === "string" ? (parsed["kind"] as string) : undefined;
      if (m.weight < 0 || m.weight > 1) {
        findings.push({
          check: "weight_bounds",
          id: m.id,
          detail: `weight ${m.weight} outside [0, 1]`,
          hint: "memory update --weight <0-1>",
        });
      } else if (
        (kind === "directive" || kind === "summary" || kind === "objective") &&
        m.weight < 0.8
      ) {
        findings.push({
          check: "weight_bounds",
          id: m.id,
          detail: `${kind} with weight ${m.weight} below the 0.8 floor`,
          hint: "memory update --weight 0.8",
        });
      }
    }

    for (const m of mems) {
      if (m.metadata !== null && parsedMeta.get(m.id) === undefined) {
        findings.push({
          check: "invalid_metadata_json",
          id: m.id,
          detail: "metadata column is not valid JSON",
          hint: "memory update --metadata '{...}' replaces it",
        });
      }
    }

    for (const m of mems) {
      if (m.status !== "superseded" && m.status !== "merged") continue;
      const bridged = edges.some(
        (e) =>
          e.from_id === m.id && (e.kind === "supersedes" || e.kind === "merges"),
      );
      if (!bridged) {
        findings.push({
          check: "status_without_bridge",
          id: m.id,
          detail: `status '${m.status}' but no supersedes/merges edge outgoing`,
          hint: "hand-edited status: restore to active via SQL, or create the bridge edge to the successor memory",
        });
      }
    }

    for (const m of mems) {
      if (m.status !== "active") continue;
      const linked = edges.some((e) => e.from_id === m.id || e.to_id === m.id);
      if (!linked) {
        findings.push({
          check: "isolated_active",
          id: m.id,
          detail: "active memory with no edges in either direction",
          hint: "link it to related memories (dream relink step)",
        });
      }
    }

    const titleGroups = new Map<string, string[]>();
    for (const m of mems) {
      if (m.status !== "active") continue;
      const firstLine = m.content.split("\n")[0].trim();
      // Only memories whose FIRST line is a markdown heading carry a title;
      // heading-less memories never group (the audit's <no-heading> false positive).
      if (!firstLine.startsWith("#")) continue;
      const group = titleGroups.get(firstLine) ?? [];
      group.push(m.id);
      titleGroups.set(firstLine, group);
    }
    for (const [title, ids] of titleGroups) {
      if (ids.length > 1) {
        findings.push({
          check: "duplicate_titles",
          detail: `${ids.length} active memories share the title "${title}": ${ids.join(", ")}`,
          hint: "merge the group, or supersede with a distinct title",
        });
      }
    }

    // Stale handoff (evaluation #1, 2026-10-17): a session that ended
    // without its closing summary leaves a decision younger than the newest
    // summary, so the next session's recovery ritual would serve a handoff
    // one or more arcs behind the store. Legacy-free ordering: notes are
    // excluded on purpose — the experience note is checklist step 2, BY
    // DESIGN stored after the summary; decisions are the binding truth that
    // must be recapped. Fires only when summaries exist: a store with none
    // has not yet adopted the handoff convention and would flag on every
    // mid-session call.
    let newestSummary: string | null = null;
    let newestDecision: string | null = null;
    for (const m of mems) {
      if (m.status !== "active") continue;
      const parsed = parsedMeta.get(m.id);
      const kind = parsed && typeof parsed["kind"] === "string" ? (parsed["kind"] as string) : undefined;
      if (kind === "summary") {
        if (newestSummary === null || m.created_at > newestSummary) newestSummary = m.created_at;
      } else if (kind === "decision") {
        if (newestDecision === null || m.created_at > newestDecision) newestDecision = m.created_at;
      }
    }
    if (newestSummary !== null && newestDecision !== null && newestDecision > newestSummary) {
      findings.push({
        check: "stale_handoff",
        detail: `newest active decision (${newestDecision}) is newer than the newest summary (${newestSummary}) — a session likely ended without its summary`,
        hint: 'store a kind:"summary" recapping the arcs since the last one before ending a session',
      });
    }

    findings.push(...this.checkFts());

    const edges_by_kind: Record<string, number> = {};
    for (const e of edges) {
      edges_by_kind[e.kind] = (edges_by_kind[e.kind] ?? 0) + 1;
    }
    // Informational, never a finding: active->superseded edges are normal
    // history, resolved at read time by relations({ resolve: true }).
    const active_to_superseded = edges.filter(
      (e) =>
        byId.get(e.from_id)?.status === "active" &&
        byId.get(e.to_id)?.status === "superseded",
    ).length;

    return {
      healthy: findings.length === 0,
      findings,
      summary: {
        checks: DOCTOR_CHECK_COUNT,
        issues: findings.length,
        memories: mems.length,
        edges: edges.length,
        edges_by_kind,
        active_to_superseded,
        fts_rebuilt: opts.fix === true,
      },
    };
  }

  /**
   * The closing ritual, composed: doctor first as a hard gate (never
   * finish, dream or recommend a relaunch over a sick store), then the
   * session obligations the doctor is deliberately blind to — it validates
   * the store, not the session. A fresh summary and the standing
   * evaluation's experience note must exist in the window when the session
   * stored memories, and the dream debt is made mechanical: the volume line
   * blocks, the session-end clause surfaces as a visible warn instead of
   * the agent's silent judgment call. Read-only — runs against a read-only
   * store; the judgment debts it names stay the agent's to pay. Exit code
   * semantics match doctor: 1 when blocking findings exist (a successful
   * diagnosis, not an error).
   */
  finish(): FinishReport {
    const doctor = this.doctor();
    const findings: FinishFinding[] = doctor.findings.map((f) => ({
      ...f,
      severity: "block" as const,
    }));

    const rows = this.db
      .prepare("SELECT id, metadata, created_at, status FROM memories")
      .all() as unknown as Pick<MemoryRow, "id" | "metadata" | "created_at" | "status">[];

    let windowMemories = 0;
    let summaryInWindow = false;
    let evalNoteInWindow = false;
    for (const m of rows) {
      const created = Date.parse(m.created_at);
      const inWindow = created >= Date.now() - FINISH_WINDOW_MS;
      if (!inWindow) continue;
      // Any status: stored within the window is stored, superseded or not.
      windowMemories++;
      if (m.status !== "active" || m.metadata === null) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(m.metadata) as Record<string, unknown>;
      } catch {
        continue; // invalid JSON is already a blocked doctor finding
      }
      const kind = typeof parsed["kind"] === "string" ? parsed["kind"] : undefined;
      if (kind === "summary") summaryInWindow = true;
      if (
        kind === "note" &&
        Array.isArray(parsed["tags"]) &&
        parsed["tags"].includes("evaluation")
      ) {
        evalNoteInWindow = true;
      }
    }

    // The dream debt: the newest dream, and what accumulated since.
    let lastDream: string | null = null;
    for (const m of rows) {
      if (m.status !== "active" || m.metadata === null) continue;
      try {
        const parsed = JSON.parse(m.metadata) as Record<string, unknown>;
        if (parsed["kind"] !== "dream") continue;
      } catch {
        continue;
      }
      if (lastDream === null || m.created_at > lastDream) lastDream = m.created_at;
    }
    let sinceDream = 0;
    if (lastDream !== null) {
      const dreamTime = Date.parse(lastDream);
      for (const m of rows) {
        if (Date.parse(m.created_at) > dreamTime) sinceDream++;
      }
    }

    if (windowMemories > 0 && !summaryInWindow) {
      findings.push({
        check: "session_summary",
        severity: "block",
        detail: `${windowMemories} memories stored within the last ${
          FINISH_WINDOW_MS / (60 * 60 * 1000)
        }h but no active summary in the window — the register is not self-sufficient for a fresh session`,
        hint: 'store a kind:"summary" recapping the arcs of the session before ending it or recommending a relaunch',
      });
    }

    if (windowMemories > 0 && !evalNoteInWindow) {
      findings.push({
        check: "experience_note",
        severity: "block",
        detail: `no experience note within the last ${
          FINISH_WINDOW_MS / (60 * 60 * 1000)
        }h while ${windowMemories} memories were stored — the standing evaluation is owed this session`,
        hint: 'store kind:"note" with tags ["evaluation"]: retrieval hits and misses, friction, gotchas',
      });
    }

    if (lastDream === null) {
      if (rows.length >= DREAM_VOLUME_LINE) {
        findings.push({
          check: "dream_debt",
          severity: "block",
          detail: `no dream exists while the store holds ${rows.length} memories — the volume line is long past and consolidation never happened`,
          hint: "run the five dream operations (relink, merge, supersede, rebalance, synthesize) and store a kind:\"dream\" memory",
        });
      } else if (rows.length > 0) {
        findings.push({
          check: "dream_debt",
          severity: "warn",
          detail: `no dream exists yet; ${rows.length} memories accumulated — young store, no consolidation due until a threshold fires`,
          hint: "dream when a threshold fires (edge ratio below 1.5, +10 memories, or a non-trivial session ends)",
        });
      }
    } else if (sinceDream >= DREAM_VOLUME_LINE) {
      findings.push({
        check: "dream_debt",
        severity: "block",
        detail: `${sinceDream} memories stored since the last dream (${lastDream}) — the volume line passed`,
        hint: "run the five dream operations (relink, merge, supersede, rebalance, synthesize) and store a kind:\"dream\" memory",
      });
    } else if (sinceDream > 0 && Date.parse(lastDream) < Date.now() - FINISH_WINDOW_MS) {
      findings.push({
        check: "dream_debt",
        severity: "warn",
        detail: `${sinceDream} memories stored since the last dream (${lastDream}), none within the window — the session-end clause fired`,
        hint: "run the five dream operations or state aloud why this session does not owe one",
      });
    }

    const blocks = findings.filter((f) => f.severity === "block").length;
    return {
      healthy: blocks === 0,
      findings,
      summary: {
        window_hours: FINISH_WINDOW_MS / (60 * 60 * 1000),
        window_memories: windowMemories,
        last_dream: lastDream,
        memories_since_dream: sinceDream,
        blocks,
        warns: findings.length - blocks,
        doctor: { checks: doctor.summary.checks, issues: doctor.summary.issues },
      },
    };
  }

  /**
   * Verify the FTS5 index against the memories table on a VACUUM INTO
   * snapshot — the doctor must never take a write lock on a store agents
   * write to concurrently. The snapshot is deleted before returning.
   *
   * The rowid diff runs through an fts5vocab 'instance' table: FTS5 serves
   * plain scans (and count(*)) of an external-content table FROM THE CONTENT
   * TABLE, so ghost rowids are invisible to them; only the vocabulary side
   * reads the index. integrity-check adds internal-structure verification.
   */
  private checkFts(): DoctorFinding[] {
    const out: DoctorFinding[] = [];
    const snapDir = mkdtempSync(join(tmpdir(), "ai-memory-doctor-"));
    try {
      const snapPath = join(snapDir, "snapshot.db").replace(/'/g, "''");
      this.run(() => this.db.exec(`VACUUM INTO '${snapPath}'`));
      const snap = new DatabaseSync(snapPath);
      try {
        snap.exec(
          "CREATE VIRTUAL TABLE fts_vocab" +
            " USING fts5vocab('memories_fts', 'instance')",
        );
        const indexRowids = new Set(
          (snap.prepare("SELECT DISTINCT doc FROM fts_vocab").all() as { doc: number }[]).map(
            (r) => r.doc,
          ),
        );
        const memRowids = (
          snap.prepare("SELECT rowid FROM memories").all() as { rowid: number }[]
        ).map((r) => r.rowid);
        // Ghosts show up as an index rowid the content lacks; holes as the
        // reverse. Equal sizes plus full content membership ⇒ identical sets.
        const drifted =
          indexRowids.size !== memRowids.length ||
          memRowids.some((r) => !indexRowids.has(r));
        if (drifted) {
          out.push({
            check: "fts_integrity",
            detail: `FTS index holds ${indexRowids.size} rowids for ${memRowids.length} memories`,
            hint: "memory doctor --fix rebuilds the FTS index (mechanical, no content rewrite)",
          });
        }
        try {
          snap.exec("INSERT INTO memories_fts(memories_fts) VALUES('integrity-check')");
        } catch (err) {
          out.push({
            check: "fts_integrity",
            detail: `integrity-check failed: ${err instanceof Error ? err.message : String(err)}`,
            hint: "memory doctor --fix rebuilds the FTS index (mechanical, no content rewrite)",
          });
        }
      } finally {
        snap.close();
      }
    } finally {
      rmSync(snapDir, { recursive: true, force: true });
    }
    return out;
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
          "errcode" in err &&
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

/**
 * Decides whether a search failure came from malformed FTS5 query glue
 * (punctuation inside bare tokens) rather than from a plain SQL problem.
 * FTS5 signals it in two ways: a "fts5: syntax error" from characters it
 * cannot parse, or "no such column: X" when a hyphenated/colonated
 * compound makes it read X as a column filter — only trusted when X
 * appears in the query itself.
 */
export function ftsErrorFromQuery(err: unknown, query: string): boolean {
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
export function sanitizeFtsQuery(query: string): string | null {
  const parts = query.match(/"[^"]*"|[^\s"]+/g);
  if (!parts) return null;
  const cleaned: string[] = [];
  for (const part of parts) {
    if (part.startsWith('"')) {
      const inner = part
        .slice(1, -1)
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (inner) cleaned.push(`"${inner}"`);
      continue;
    }
    if (/^(OR|AND|NOT)$/i.test(part)) {
      cleaned.push(part.toUpperCase());
      continue;
    }
    const pieces = part.replace(/[^\p{L}\p{N}]/gu, " ").split(/\s+/);
    for (const piece of pieces) {
      if (piece) cleaned.push(piece);
    }
  }
  return cleaned.length > 0 ? cleaned.join(" ") : null;
}
