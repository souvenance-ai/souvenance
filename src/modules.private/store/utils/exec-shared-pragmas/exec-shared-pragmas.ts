/**
 * The pragmas both open paths share: the busy handler and FK enforcement.
 * The read-only open stops here — the store is served as its owner left
 * it, and no journal_mode may switch under it.
 */
import type { DatabaseSync } from 'node:sqlite';

/** The busy handler both open paths share, in milliseconds. */
const BUSY_TIMEOUT_MS = 5000;

export function execSharedPragmas(db: DatabaseSync): void {
  // busy_timeout MUST come first: PRAGMA journal_mode = WAL grabs an exclusive
  // file-header lock when the store is fresh (or unwal'd). With the busy handler
  // unset, any racing open loses that grab immediately with SQLITE_BUSY.
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec('PRAGMA foreign_keys = ON');
}
