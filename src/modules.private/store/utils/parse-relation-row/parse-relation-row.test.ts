import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseRelationRow } from './parse-relation-row.ts';

test('projects one edges row into a Relation — metadata parsed', () => {
  assert.deepEqual(
    parseRelationRow({
      from_id: 'from-1',
      to_id: 'to-1',
      kind: 'references',
      metadata: '{"note":"why"}',
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    {
      from_id: 'from-1',
      to_id: 'to-1',
      kind: 'references',
      metadata: { note: 'why' },
      created_at: '2026-01-01T00:00:00.000Z',
    },
  );
});

test('corrupted metadata JSON serves as null — the reads forgive (#12)', () => {
  const relation = parseRelationRow({
    from_id: 'from-1',
    to_id: 'to-1',
    kind: 'references',
    metadata: '{not json',
    created_at: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(relation.metadata, null);
});
