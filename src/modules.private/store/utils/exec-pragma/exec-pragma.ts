/**
 * The read-write open's pragmas: the shared busy handler and FK
 * enforcement, plus the WAL journal mode.
 */
import { execSharedPragmas } from '../exec-shared-pragmas/exec-shared-pragmas.ts';
import type { DatabaseSync } from 'node:sqlite';

export function execPragma(db: DatabaseSync): void {
  execSharedPragmas(db);
  db.exec('PRAGMA journal_mode = WAL');
}
