import assert from 'node:assert/strict';
import { test } from 'vitest';
import { withBusyRetry } from './with-busy-retry.ts';

/** A busy error the way node:sqlite raises it: `errcode` 5, SQLITE_BUSY. */
function busyError(): Error {
  return Object.assign(new Error('database is locked'), { errcode: 5 });
}

test("returns the operation's result on first success", () => {
  assert.equal(
    withBusyRetry(() => 42),
    42,
  );
});

test('retries on SQLITE_BUSY and succeeds once the lock clears', () => {
  let attempts = 0;
  const result = withBusyRetry(() => {
    attempts++;
    if (attempts < 3) throw busyError();
    return 'won';
  });
  assert.equal(result, 'won');
  assert.equal(attempts, 3, 'two busy losses, one win');
});

test('rethrows a non-busy error immediately — no retry eats real failures', () => {
  let attempts = 0;
  assert.throws(
    () =>
      withBusyRetry(() => {
        attempts++;
        throw new Error('not a lock problem');
      }),
    /not a lock problem/,
  );
  assert.equal(attempts, 1);
});

test('rethrows the busy error when the retries are exhausted', () => {
  assert.throws(
    () =>
      withBusyRetry(() => {
        throw busyError();
      }),
    /database is locked/,
  );
});
