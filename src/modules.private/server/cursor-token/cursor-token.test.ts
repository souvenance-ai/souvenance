import assert from 'node:assert/strict';
import { test } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor-token.ts';

test('the token round-trips the keyset key it was built from', () => {
  const token = encodeCursor({ created_at: '2026-10-28T10:00:00.000Z', id: 'abc-123' });
  assert.deepEqual(decodeCursor(token), { created_at: '2026-10-28T10:00:00.000Z', id: 'abc-123' });
});

test('the token is opaque — base64url, no separators that fight a query string', () => {
  const token = encodeCursor({ created_at: '2026-10-28T10:00:00.000Z', id: 'abc' });
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'base64url only');
});

test('anything not ours decodes to undefined — garbage, wrong shape, tampered JSON', () => {
  assert.equal(decodeCursor('garbage'), undefined);
  assert.equal(decodeCursor(Buffer.from('{"nope": true}').toString('base64url')), undefined);
  assert.equal(decodeCursor(Buffer.from('[1,2]').toString('base64url')), undefined);
  assert.equal(
    decodeCursor(Buffer.from('{"created_at": 42, "id": "x"}').toString('base64url')),
    undefined,
    'a non-string created_at is not ours',
  );
});
