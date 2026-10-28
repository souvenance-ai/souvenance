import assert from 'node:assert/strict';
import { test } from 'vitest';
import { StoreError } from './store-error.ts';

test('carries the code and the message it was raised with', () => {
  const err = new StoreError('conflict', `cannot supersede a memory with status 'merged'`);
  assert.equal(err.code, 'conflict');
  assert.equal(err.message, `cannot supersede a memory with status 'merged'`);
});

test('is an Error — existing message-pinning catch blocks keep working', () => {
  const err = new StoreError('not_found', 'memory not found: abc');
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'StoreError');
});

test('covers the five codes the server maps statuses on', () => {
  const codes = ['not_found', 'conflict', 'invalid', 'busy', 'read_only'] as const;
  for (const code of codes) {
    const err = new StoreError(code, 'x');
    assert.equal(err.code, code);
  }
});
