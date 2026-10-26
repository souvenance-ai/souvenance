import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sanitizeFtsQuery } from './sanitize-fts-query.ts';

test('preserves the operators and quoted phrases', () => {
  assert.equal(sanitizeFtsQuery('apple OR banana'), 'apple OR banana');
  assert.equal(sanitizeFtsQuery('"apple fruit"'), '"apple fruit"');
  assert.equal(sanitizeFtsQuery('apple NOT banana'), 'apple NOT banana');
});

test('splits dotted numerics and hyphenated/colonated identifiers into plain tokens', () => {
  assert.equal(sanitizeFtsQuery('0.9 vs better-sqlite3'), '0 9 vs better sqlite3');
  assert.equal(sanitizeFtsQuery('node:sqlite'), 'node sqlite');
});

test('nothing searchable returns null — the caller rethrows the original error', () => {
  assert.equal(sanitizeFtsQuery('((('), null);
});
