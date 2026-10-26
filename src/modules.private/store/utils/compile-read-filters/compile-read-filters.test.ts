import assert from 'node:assert/strict';
import { test } from 'vitest';
import { compileReadFilters } from './compile-read-filters.ts';

test('no filters compile to no conditions', () => {
  assert.deepEqual(compileReadFilters({}), []);
});

test('kind compiles to a bound IN list — one condition, every kind a parameter', () => {
  assert.deepEqual(compileReadFilters({ kind: ['note', 'log'] }), [
    { sql: 'm.kind IN (?, ?)', params: ['note', 'log'] },
  ]);
  assert.deepEqual(compileReadFilters({ kind: ['note'] }), [
    { sql: 'm.kind IN (?)', params: ['note'] },
  ]);
});

test('metadata compiles one json_valid-guarded equality per path', () => {
  const conditions = compileReadFilters({
    metadata: { project: 'souvenance', 'nested.owner': 'val', 'tags[0]': 'a' },
  });
  assert.equal(conditions.length, 3);
  assert.equal(
    conditions[0]!.sql,
    "json_extract(CASE WHEN json_valid(m.metadata) THEN m.metadata END, '$.project') = ?",
  );
  assert.deepEqual(conditions[0]!.params, ['souvenance']);
  assert.ok(conditions[1]!.sql.includes(`'$.nested.owner'`), 'dot-paths compose');
  assert.ok(conditions[2]!.sql.includes(`'$.tags[0]'`), 'indices compose');
  assert.deepEqual(conditions[2]!.params, ['a']);
});

test('JSON booleans bind as 1/0 — node:sqlite refuses boolean parameters', () => {
  assert.deepEqual(compileReadFilters({ metadata: { flag: true } })[0]!.params, [1]);
  assert.deepEqual(compileReadFilters({ metadata: { flag: false } })[0]!.params, [0]);
});

test("numbers bind as themselves — the typed equality is the caller's", () => {
  assert.deepEqual(compileReadFilters({ metadata: { effort: 3 } })[0]!.params, [3]);
});

test('empty filters refuse with the shape — a filter set without intention is a caller bug', () => {
  assert.throws(() => compileReadFilters({ kind: [] }), /kind filter refuses an empty list/);
  assert.throws(
    () => compileReadFilters({ metadata: {} }),
    /metadata filter refuses an empty object/,
  );
});

test('empty or non-string kind entries refuse', () => {
  assert.throws(
    () => compileReadFilters({ kind: ['note', ''] }),
    /kind filter entries must be non-empty kind names/,
  );
});

test('non-scalar metadata values refuse', () => {
  assert.throws(
    () => compileReadFilters({ metadata: { project: undefined as unknown as string } }),
    /metadata filter values must be strings, numbers or booleans/,
  );
});

test('paths outside the grammar refuse — wildcards, dotted keys, bad indices, empties', () => {
  assert.throws(() => compileReadFilters({ metadata: { '': 'x' } }), /non-empty dot-paths/);
  assert.throws(() => compileReadFilters({ metadata: { 'bad key': 'x' } }), /refused: "bad key"/);
  assert.throws(() => compileReadFilters({ metadata: { 'a.*': 'x' } }), /refused: "a\.\*"/);
  assert.throws(() => compileReadFilters({ metadata: { 'a..b': 'x' } }), /refused: "a\.\.b"/);
  assert.throws(() => compileReadFilters({ metadata: { $root: 'x' } }), /refused: "\$root"/);
  assert.throws(() => compileReadFilters({ metadata: { 'a[-1]': 'x' } }), /refused: "a\[-1\]"/);
  assert.throws(() => compileReadFilters({ metadata: { 'a.[0]': 'x' } }), /refused: "a\.\[0\]"/);
});
