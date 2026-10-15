import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrate } from "./migrations.ts";
import type {
  StoreOptions,
  UpdateOptions,
  SearchOptions,
  ListOptions,
  TagsOptions,
  RelationsOptions,
  Direction,
  Memory,
  MemoryStatus,
  Relation,
  Stats,
  SearchResult,
  TagCount,
} from "./types.ts";

export const DEFAULT_DB_PATH = ".ai-memory/memory.db";

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
}

function execPragma(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
}

export class Store {
  readonly db: DatabaseSync;
  readonly dbPath: string;

  private constructor(db: DatabaseSync, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static open(opts: OpenOptions = {}): Store {
    const dbPath = resolve(opts.dbPath ?? DEFAULT_DB_PATH);
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    execPragma(db);
    migrate(db);
    return new Store(db, dbPath);
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
    if (!content) throw new Error("content must be non-empty");
    const newId = randomUUID();
    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const weight = opts.weight ?? 0.5;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db.exec("BEGIN");
      try {
        this.assertActive(oldId, "supersede");
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
    if (ids.length < 2) throw new Error("merge requires at least 2 memories");
    if (!content) throw new Error("content must be non-empty");
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`duplicate id in merge: ${id}`);
      seen.add(id);
    }
    const newId = randomUUID();
    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const weight = opts.weight ?? 0.5;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db.exec("BEGIN");
      try {
        for (const id of ids) {
          this.assertActive(id, "merge");
        }
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
    const existing = this.db
      .prepare("SELECT 1 FROM memories WHERE id = ?")
      .get(id);
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
    if (sets.length === 0) throw new Error("update requires at least one of --metadata or --weight");
    params.push(id);
    this.run(() => {
      this.db
        .prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`)
        .run(...params);
    });
  }

  delete(id: string): void {
    const existing = this.db
      .prepare("SELECT 1 FROM memories WHERE id = ?")
      .get(id);
    if (!existing) throw new Error(`memory not found: ${id}`);
    this.run(() => {
      this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    });
  }

  deprecate(id: string): void {
    this.assertActive(id, "deprecate");
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
    if (!kind) throw new Error("kind must be non-empty");
    const fromExists = this.db
      .prepare("SELECT 1 FROM memories WHERE id = ?")
      .get(fromId);
    if (!fromExists) throw new Error(`memory not found: ${fromId}`);
    const toExists = this.db
      .prepare("SELECT 1 FROM memories WHERE id = ?")
      .get(toId);
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
      if (results.length > 0) {
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
    this.run(() => {
      this.db
        .prepare("UPDATE memories SET access_count = access_count + 1 WHERE id = ?")
        .run(id);
    });
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

    return rows.map(parseRelationRow);
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
