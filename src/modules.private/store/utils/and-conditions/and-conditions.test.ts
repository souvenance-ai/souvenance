import assert from 'node:assert/strict';
import { test } from 'vitest';
import { andConditions } from './and-conditions.ts';

test('no conditions compile to an empty clause — no fragment, no parameters', () => {
  assert.deepEqual(andConditions([]), { sql: '', params: [] });
});

test('conditions AND together — the text joins, the parameters follow in order', () => {
  assert.deepEqual(
    andConditions([
      { sql: "m.status IN ('active', 'hot')", params: [] },
      { sql: 'm.kind IN (?)', params: ['note'] },
      { sql: 'm.created_at < ?', params: ['2026-01-01'] },
    ]),
    {
      sql: "m.status IN ('active', 'hot') AND m.kind IN (?) AND m.created_at < ?",
      params: ['note', '2026-01-01'],
    },
  );
});
