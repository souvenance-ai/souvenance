import assert from 'node:assert/strict';
import { test } from 'vitest';
import { composeForkName } from './compose-fork-name.ts';

test('the first free candidate wins — source-fork when nothing occupies it', () => {
  assert.equal(
    composeForkName('euria', () => false),
    'euria-fork',
  );
});

test('occupied candidates walk the suffix ladder — -fork-2, -fork-3, …', () => {
  const occupied = new Set<string>(['euria-fork', 'euria-fork-2']);
  assert.equal(
    composeForkName('euria', (candidate) => occupied.has(candidate)),
    'euria-fork-3',
  );
});

test('a long source truncates before the suffix lands — the grammar never breaks', () => {
  const composed = composeForkName('abcdefghijklmnopqrstuvwxyz0123', () => false);
  assert.ok(composed.length <= 32);
  assert.ok(composed.endsWith('-fork'));
});

test('the bound holds: ninety-nine occupied candidates still compose', () => {
  const occupied = (candidate: string): boolean => candidate !== 'euria-fork-99';
  assert.equal(composeForkName('euria', occupied), 'euria-fork-99');
});
