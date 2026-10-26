import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'vitest';
import { execSharedPragmas } from './exec-shared-pragmas.ts';

test('sets the busy handler first and the FK enforcement', () => {
  const db = new DatabaseSync(':memory:');
  try {
    execSharedPragmas(db);
    assert.equal(
      (db.prepare('PRAGMA busy_timeout').get() as { timeout: number }).timeout,
      5000,
      'the racing-open window the WAL grab needs',
    );
    assert.equal(
      (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys,
      1,
    );
  } finally {
    db.close();
  }
});

test('never switches the journal mode — the read-only open serves as left', () => {
  const db = new DatabaseSync(':memory:');
  try {
    execSharedPragmas(db);
    assert.equal(
      (db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode,
      'memory',
      ':memory: cannot WAL — the point is the pragma was not touched',
    );
  } finally {
    db.close();
  }
});
