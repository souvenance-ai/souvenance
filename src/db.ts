import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrate } from "./migrations.ts";

export const DEFAULT_DB_PATH = ".ai-memory/memory.db";

const SQLITE_BUSY = 5;
const BUSY_RETRIES = 50;
const BUSY_DELAY_MS = 20;

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
