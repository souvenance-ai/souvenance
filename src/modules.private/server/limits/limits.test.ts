/**
 * The caps' home, unit-pinned: the explicit limit judges only itself
 * (absent = the verb's own behavior), 1000 is the ceiling an explicit
 * page may ask for, 100 the page a silent request gets (Q18 revised,
 * 2026-10-28). The shapes that judge them live in `wire/`; these
 * constants are the numbers the teaching quotes.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { DEFAULT_LIMIT, MAX_LIMIT } from './limits.ts';

test('the page numbers are the decided caps — 100 by silence, 1000 by request', () => {
  assert.equal(DEFAULT_LIMIT, 100);
  assert.equal(MAX_LIMIT, 1000);
});
