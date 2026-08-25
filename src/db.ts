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
  RelationsOptions,
  Direction,
  Memory,
  Relation,
  Stats,
  SearchResult,
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
}

interface SearchRow {
  id: string;
  content: string;
  metadata: string | null;
  created_at: string;
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
  };
}

function parseSearchRow(row: SearchRow): SearchResult {
  return {
    id: row.id,
    content: row.content,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    created_at: row.created_at,
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

  store(content: string, opts: StoreOptions = {}): string {
    if (!content) throw new Error("content must be non-empty");
    const id = randomUUID();
    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const created_at = new Date().toISOString();
    this.run(() => {
      this.db
        .prepare(
          "INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(id, content, metadata, created_at);
    });
    return id;
  }

  update(id: string, opts: UpdateOptions): void {
    if (opts.content === undefined && opts.metadata === undefined) {
      throw new Error("at least one of content or metadata must be provided");
    }
    const existing = this.db
      .prepare("SELECT 1 FROM memories WHERE id = ?")
      .get(id);
    if (!existing) throw new Error(`memory not found: ${id}`);

    const sets: string[] = [];
    const params: (string | null)[] = [];
    if (opts.content !== undefined) {
      if (!opts.content) throw new Error("content must be non-empty");
      sets.push("content = ?");
      params.push(opts.content);
    }
    if (opts.metadata !== undefined) {
      sets.push("metadata = ?");
      params.push(JSON.stringify(opts.metadata));
    }
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
          "INSERT OR IGNORE INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(fromId, toId, kind, metadata, created_at);
    });
  }

  close(): void {
    this.db.close();
  }

  search(query: string, opts: SearchOptions = {}): SearchResult[] {
    if (!query) throw new Error("query must be non-empty");
    const limit = opts.limit ?? 20;
    let sql = `SELECT m.id, m.content, m.metadata, m.created_at, bm25(memories_fts) AS rank FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?`;
    const params: (string | number)[] = [query];
    if (opts.where) {
      sql += ` AND ${opts.where}`;
    }
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as unknown as SearchRow[];
    return rows.map(parseSearchRow);
  }

  get(id: string): Memory | null {
    const row = this.db
      .prepare("SELECT id, content, metadata, created_at FROM memories WHERE id = ?")
      .get(id) as unknown as MemoryRow | undefined;
    if (!row) return null;
    return parseMemoryRow(row);
  }

  list(opts: ListOptions = {}): Memory[] {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    let sql = `SELECT id, content, metadata, created_at FROM memories`;
    const params: (string | number)[] = [];
    if (opts.where) {
      sql += ` WHERE ${opts.where}`;
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
          `SELECT from_id, to_id, kind, metadata, created_at FROM edges WHERE from_id = ? ORDER BY created_at DESC`,
        )
        .all(id) as unknown as RelationRow[];
      rows.push(...outRows);
    }

    if (direction === "in" || direction === "both") {
      const inRows = this.db
        .prepare(
          `SELECT from_id, to_id, kind, metadata, created_at FROM edges WHERE to_id = ? ORDER BY created_at DESC`,
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
    const edgeCount = this.db
      .prepare("SELECT count(*) AS c FROM edges")
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
      edges: edgeCount.c,
      edges_by_kind,
    };
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
