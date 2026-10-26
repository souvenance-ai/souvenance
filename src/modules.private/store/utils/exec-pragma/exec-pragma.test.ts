import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'vitest';
import { execPragma } from './exec-pragma.ts';

test('adds the WAL journal mode to the shared pragmas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-pragmas-'));
  try {
    // A file db — :memory: cannot switch to WAL.
    const db = new DatabaseSync(join(dir, 'memory.db'));
    try {
      execPragma(db);
      assert.equal(
        (db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode,
        'wal',
      );
      assert.equal(
        (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys,
        1,
        'the shared pragmas ride along',
      );
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
