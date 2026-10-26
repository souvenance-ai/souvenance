import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseRawMetadata } from './parse-raw-metadata.ts';

test('parses a JSON object column', () => {
  assert.deepEqual(parseRawMetadata('{"tags":["a"]}'), { tags: ['a'] });
});

test('a null column parses to null — no metadata is a state, not a corruption', () => {
  assert.equal(parseRawMetadata(null), null);
});

test("invalid JSON collapses to null — the reads' forgiveness precedent (#12)", () => {
  assert.equal(parseRawMetadata('{not json'), null);
});
