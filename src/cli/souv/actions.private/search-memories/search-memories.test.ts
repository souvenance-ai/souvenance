import assert from 'node:assert/strict';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import {
  bootTestWire,
  type TestWire,
} from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { searchMemories } from './search-memories.ts';

/** One memory seeded through the wire — the action under test stays the only subject. */
async function seed(
  wire: TestWire,
  content: string,
  kind = 'note',
  metadata?: Record<string, unknown>,
): Promise<string> {
  const answer = await httpCall(wire.store, {
    method: 'post',
    path: '/memories',
    body: metadata === undefined ? { content, kind } : { content, kind, metadata },
  });
  assert.equal(answer.status, 201, `the seed refused: ${JSON.stringify(answer.document)}`);
  return (answer.document as { id: string }).id;
}

test('the hits serve verbatim — the bare ranked array', async () => {
  const wire = await bootTestWire();
  try {
    const hit = await seed(wire, 'the needle in the fabric', 'note');
    await seed(wire, 'nothing to find here', 'note');
    const answer = await searchMemories(wire.store, { text: 'needle' });
    assert.equal(answer.exitCode, 0);
    const hits = answer.document as readonly { id: string }[];
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.id, hit);
  } finally {
    await wire.close();
  }
});

test('the limit rides — one hit where two match', async () => {
  const wire = await bootTestWire();
  try {
    await seed(wire, 'needle one', 'note');
    await seed(wire, 'needle two', 'note');
    const answer = await searchMemories(wire.store, { text: 'needle', limit: 1 });
    assert.equal(answer.exitCode, 0);
    assert.equal((answer.document as readonly unknown[]).length, 1);
  } finally {
    await wire.close();
  }
});

test('the kind filter rides', async () => {
  const wire = await bootTestWire();
  try {
    const hit = await seed(wire, 'the needle in the fabric', 'dream');
    await seed(wire, 'the needle in the noise', 'note');
    const answer = await searchMemories(wire.store, { text: 'needle', kind: ['dream'] });
    assert.equal(answer.exitCode, 0);
    const hits = answer.document as readonly { id: string }[];
    assert.deepEqual(
      hits.map((hitItem) => hitItem.id),
      [hit],
    );
  } finally {
    await wire.close();
  }
});

test('the metadata filter rides', async () => {
  const wire = await bootTestWire();
  try {
    const hit = await seed(wire, 'the needle in the fabric', 'note', { topic: 'x' });
    await seed(wire, 'the needle in the noise', 'note', { topic: 'y' });
    const answer = await searchMemories(wire.store, { text: 'needle', metadata: '{"topic": "x"}' });
    assert.equal(answer.exitCode, 0);
    const hits = answer.document as readonly { id: string }[];
    assert.deepEqual(
      hits.map((hitItem) => hitItem.id),
      [hit],
    );
  } finally {
    await wire.close();
  }
});

test('the text is demanded locally — one envelope, no call', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await searchMemories(wire.store, {});
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /search text is missing/);
  } finally {
    await wire.close();
  }
});
