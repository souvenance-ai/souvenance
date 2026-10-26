import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validateMetadataKeys } from './validate-metadata-keys.ts';

test('accepts segments of letters, digits, "-" and "_" at every depth', () => {
  assert.doesNotThrow(() =>
    validateMetadataKeys(
      { project: 'x', my_key: 1, 'with-dash': true, nested: { deep: [{ leaf: 'ok' }] } },
      '$',
    ),
  );
});

test('refuses a faulty key, naming it and its path', () => {
  assert.throws(() => validateMetadataKeys({ 'bad.key': 1 }, '$'), /refused: "bad\.key" at \$/);
  assert.throws(
    () => validateMetadataKeys({ project: { 'bad key': 1 } }, '$'),
    /refused: "bad key" at \$\.project/,
  );
});

test("the array element's index rides the path — the faulty key is located", () => {
  assert.throws(
    () => validateMetadataKeys({ items: [{ ok: 1 }, { 'a[0]': 2 }] }, '$'),
    /refused: "a\[0\]" at \$\.items\[1\]/,
  );
});

test('an empty key is refused — it addresses nothing', () => {
  assert.throws(() => validateMetadataKeys({ '': 1 }, '$'), /refused: "" at \$/);
});

test('scalars and bare arrays carry no keys to refuse', () => {
  assert.doesNotThrow(() => validateMetadataKeys([1, 'two', true, null], '$'));
  assert.doesNotThrow(() => validateMetadataKeys('scalar', '$'));
  assert.doesNotThrow(() => validateMetadataKeys(null, '$'));
  assert.doesNotThrow(() => validateMetadataKeys(undefined, '$'));
});
