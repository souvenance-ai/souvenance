/**
 * The error→status mapping's own tests (#69): the three families the
 * server serves — a Hono HTTPException carrying its own status, the
 * StoreError codes mapping by code, and the unknown error's opaque 500.
 * The full envelope behavior (messages, opacity) is pinned by the
 * server's tests; only the status is the unit's contract.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { StoreError } from '../../store/store-error/store-error.ts';
import { errorStatus } from './error-status.ts';

test('a Hono HTTPException carries its own status', () => {
  assert.equal(errorStatus(new HTTPException(403, { message: 'no such store' })), 403);
  assert.equal(errorStatus(new HTTPException(404)), 404);
});

test('a StoreError maps by code — the STATUS_BY_CODE table', () => {
  assert.equal(errorStatus(new StoreError('invalid', 'teaching')), 400);
  assert.equal(errorStatus(new StoreError('not_found', 'teaching')), 404);
  assert.equal(errorStatus(new StoreError('conflict', 'teaching')), 409);
  assert.equal(errorStatus(new StoreError('busy', 'teaching')), 503);
  assert.equal(errorStatus(new StoreError('read_only', 'teaching')), 500);
});

test('a non-StoreError is an internal error — the opaque 500', () => {
  assert.equal(errorStatus(new Error('boom')), 500);
  assert.equal(errorStatus('a string thrown'), 500);
  assert.equal(errorStatus(undefined), 500);
});
