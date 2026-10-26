import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normaliseLimit } from './normalise-limit.ts';

test("absent means the caller's fallback — 20 for the set-serving verbs, -1 for checkin", () => {
  assert.equal(normaliseLimit(undefined, 20), 20);
  assert.equal(normaliseLimit(undefined, -1), -1, "SQLite's no-cap form");
});

test('integers >= 1 pass through', () => {
  assert.equal(normaliseLimit(5, 20), 5);
});

test('refuses anything but an integer >= 1', () => {
  assert.throws(() => normaliseLimit(0, 20), /limit must be an integer >= 1/);
  assert.throws(() => normaliseLimit(2.5, 20), /limit must be an integer >= 1/);
});
