import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sidecarPaths } from './sidecar-paths.ts';

test('returns the db file and its WAL sidecars — the trio treated together', () => {
  assert.deepEqual(sidecarPaths('/stores/me.db'), [
    '/stores/me.db',
    '/stores/me.db-wal',
    '/stores/me.db-shm',
  ]);
});
