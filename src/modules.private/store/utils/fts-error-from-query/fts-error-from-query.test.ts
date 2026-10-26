import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ftsErrorFromQuery } from './fts-error-from-query.ts';

test('recognises an fts5 syntax error — punctuation the parser cannot read', () => {
  assert.equal(ftsErrorFromQuery(new Error('fts5: syntax error near "."'), '0.9'), true);
});

test('recognises a no-such-column error the query itself invited', () => {
  assert.equal(
    ftsErrorFromQuery(new Error('no such column: better-sqlite3'), 'searching better-sqlite3'),
    true,
    'the hyphenated compound made FTS5 read a token as a column filter',
  );
});

test('ignores a no-such-column error the query did not invite', () => {
  assert.equal(ftsErrorFromQuery(new Error('no such column: zzz'), 'apple'), false);
});

test('a non-Error is not an FTS failure', () => {
  assert.equal(ftsErrorFromQuery('boom', 'apple'), false);
  assert.equal(ftsErrorFromQuery(undefined, 'apple'), false);
});
