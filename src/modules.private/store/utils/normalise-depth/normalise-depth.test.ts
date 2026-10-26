import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normaliseDepth } from './normalise-depth.ts';

test('absent means 1 — raw edges by default', () => {
  assert.equal(normaliseDepth(undefined), 1);
});

test('integers >= 1 pass through — no upper bound, the caller owns the pace', () => {
  assert.equal(normaliseDepth(3), 3);
});

test('refuses anything but an integer >= 1', () => {
  assert.throws(() => normaliseDepth(0), /depth must be an integer >= 1/);
  assert.throws(() => normaliseDepth(1.5), /depth must be an integer >= 1/);
});
