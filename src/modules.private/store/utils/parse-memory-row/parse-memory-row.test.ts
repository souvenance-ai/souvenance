import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseMemoryRow } from './parse-memory-row.ts';

test('projects one memories row into a Memory — metadata parsed, status cast', () => {
  assert.deepEqual(
    parseMemoryRow({
      id: 'id-1',
      content: 'hello',
      kind: 'note',
      summary: null,
      metadata: '{"tags":["a"]}',
      created_at: '2026-01-01T00:00:00.000Z',
      status: 'active',
    }),
    {
      id: 'id-1',
      content: 'hello',
      kind: 'note',
      summary: null,
      metadata: { tags: ['a'] },
      created_at: '2026-01-01T00:00:00.000Z',
      status: 'active',
    },
  );
});

test('corrupted metadata JSON serves as null metadata — the reads forgive (#12)', () => {
  const memory = parseMemoryRow({
    id: 'id-1',
    content: 'x',
    kind: 'note',
    summary: null,
    metadata: '{not json',
    created_at: '2026-01-01T00:00:00.000Z',
    status: 'active',
  });
  assert.equal(memory.metadata, null);
});
