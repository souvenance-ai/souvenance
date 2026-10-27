import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseMetadataSegment } from './parse-metadata-segment.ts';

test('a bare segment parses to its key, no index', () => {
  assert.deepEqual(parseMetadataSegment('project'), { key: 'project', index: undefined });
  assert.deepEqual(parseMetadataSegment('my-key_2'), { key: 'my-key_2', index: undefined });
});

test('an indexed segment parses to its key and index', () => {
  assert.deepEqual(parseMetadataSegment('tags[0]'), { key: 'tags', index: 0 });
  assert.deepEqual(parseMetadataSegment('tags[12]'), { key: 'tags', index: 12 });
});

test('segments outside the grammar refuse — wildcards, spaces, empty, bad indices, nested brackets', () => {
  assert.equal(parseMetadataSegment(''), undefined);
  assert.equal(parseMetadataSegment('bad key'), undefined);
  assert.equal(parseMetadataSegment('a.*'), undefined);
  assert.equal(parseMetadataSegment('$root'), undefined);
  assert.equal(parseMetadataSegment('a[-1]'), undefined);
  assert.equal(parseMetadataSegment('a[x]'), undefined);
  assert.equal(parseMetadataSegment('a[0][1]'), undefined);
  assert.equal(parseMetadataSegment('a.'), undefined);
});
