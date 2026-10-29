import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validateMetadata } from './validate-metadata.ts';

test('accepts segments of letters, digits, "-" and "_" at every depth', () => {
  assert.doesNotThrow(() =>
    validateMetadata(
      { project: 'x', my_key: 1, 'with-dash': true, nested: { deep: { leaf: 'ok' }, flag: 2 } },
      '$',
    ),
  );
});

test('refuses a faulty key, naming it and its path', () => {
  assert.throws(() => validateMetadata({ 'bad.key': 1 }, '$'), /refused: "bad\.key" at \$/);
  assert.throws(
    () => validateMetadata({ project: { 'bad key': 1 } }, '$'),
    /refused: "bad key" at \$\.project/,
  );
});

test('a faulty key inside a nested object rides its path — the faulty key is located', () => {
  assert.throws(
    () => validateMetadata({ project: { ok: 1, nope: { 'a[0]': 2 } } }, '$'),
    /refused: "a\[0\]" at \$\.project\.nope/,
  );
});

test('an empty key is refused — it addresses nothing', () => {
  assert.throws(() => validateMetadata({ '': 1 }, '$'), /refused: "" at \$/);
});

test('scalar leaves and absence pass — string, number, boolean, null metadata itself', () => {
  assert.doesNotThrow(() => validateMetadata({ s: 'x', n: 2, b: true }, '$'));
  assert.doesNotThrow(() => validateMetadata(null, '$'));
  assert.doesNotThrow(() => validateMetadata(undefined, '$'));
});

test('arrays refuse at authoring — the filter cannot address them by index nor whole (#51)', () => {
  assert.throws(
    () => validateMetadata({ tags: ['a', 'b'] }, '$'),
    /metadata values may not be arrays — the filter cannot address them by index or compare them whole \(#40\).*refused: \$.tags/,
  );
  assert.throws(
    () => validateMetadata({ tree: { deep: [['nope']] } }, '$'),
    /refused: \$\.tree\.deep/,
  );
  assert.throws(() => validateMetadata(['top level'], '$'), /refused: \$/);
});

test('null values refuse — omit the key to say nothing (#51)', () => {
  assert.throws(
    () => validateMetadata({ owner: null }, '$'),
    /metadata values may not be null — the filter cannot ask for null \(#40\).*omit \$\.owner/,
  );
  assert.throws(() => validateMetadata({ tree: { leaf: null } }, '$'), /omit \$\.tree\.leaf/);
});
