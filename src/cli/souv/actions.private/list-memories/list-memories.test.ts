import assert from 'node:assert/strict';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import {
  bootTestWire,
  type TestWire,
} from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { listMemories } from './list-memories.ts';

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

/** The #34 guard's gate: distinct created_at — ms ties leave the serving order undefined. */
async function nextMillisecond(): Promise<void> {
  const gate = Date.now() + 2;
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
}

test('the empty store serves the empty page — the cursor null', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await listMemories(wire.store, {});
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { memories: [], next_after: null });
  } finally {
    await wire.close();
  }
});

test('the walk: one page, the cursor handed back, the next page, the exhaustion', async () => {
  const wire = await bootTestWire();
  try {
    const first = await seed(wire, 'oldest', 'note');
    await nextMillisecond();
    const second = await seed(wire, 'middle', 'note');
    await nextMillisecond();
    const third = await seed(wire, 'newest', 'note');
    const page = await listMemories(wire.store, { limit: 2 });
    assert.equal(page.exitCode, 0);
    const served = page.document as { memories: readonly { id: string }[]; next_after: string };
    assert.deepEqual(
      served.memories.map((memory) => memory.id),
      [third, second],
    );
    assert.notEqual(served.next_after, null);
    const rest = await listMemories(wire.store, { limit: 2, after: served.next_after });
    assert.equal(rest.exitCode, 0);
    const last = rest.document as {
      memories: readonly { id: string }[];
      next_after: string | null;
    };
    assert.deepEqual(
      last.memories.map((memory) => memory.id),
      [first],
    );
    assert.equal(last.next_after, null);
  } finally {
    await wire.close();
  }
});

test('a lone --kind is its singleton — the #62 idiom, one query parameter', async () => {
  const wire = await bootTestWire();
  try {
    const note = await seed(wire, 'a note', 'note');
    await seed(wire, 'a dream', 'dream');
    const answer = await listMemories(wire.store, { kind: ['note'] });
    assert.equal(answer.exitCode, 0);
    const served = answer.document as { memories: readonly { id: string }[] };
    assert.deepEqual(
      served.memories.map((memory) => memory.id),
      [note],
    );
  } finally {
    await wire.close();
  }
});

test('the repeated --kind is the IN — both kinds served', async () => {
  const wire = await bootTestWire();
  try {
    const note = await seed(wire, 'a note', 'note');
    const dream = await seed(wire, 'a dream', 'dream');
    await seed(wire, 'a vision', 'vision');
    const answer = await listMemories(wire.store, { kind: ['note', 'dream'] });
    assert.equal(answer.exitCode, 0);
    const served = answer.document as { memories: readonly { id: string }[] };
    assert.deepEqual(served.memories.map((memory) => memory.id).sort(), [note, dream].sort());
  } finally {
    await wire.close();
  }
});

test('the metadata filter rides — one JSON document, the wire judges', async () => {
  const wire = await bootTestWire();
  try {
    const match = await seed(wire, 'the one', 'note', { topic: 'x' });
    await seed(wire, 'the other', 'note', { topic: 'y' });
    const answer = await listMemories(wire.store, { metadata: '{"topic": "x"}' });
    assert.equal(answer.exitCode, 0);
    const served = answer.document as { memories: readonly { id: string }[] };
    assert.deepEqual(
      served.memories.map((memory) => memory.id),
      [match],
    );
    const miss = await listMemories(wire.store, { metadata: '{"topic": "z"}' });
    assert.deepEqual((miss.document as { memories: unknown[] }).memories, []);
  } finally {
    await wire.close();
  }
});

test('the terminals flag — a deprecated memory returns only with it', async () => {
  const wire = await bootTestWire();
  try {
    const doomed = await seed(wire, 'born to die', 'note');
    await nextMillisecond();
    const living = await seed(wire, 'the living one', 'note');
    const deprecated = await httpCall(wire.store, {
      method: 'post',
      path: `/memories/${doomed}/deprecate`,
    });
    assert.equal(deprecated.status, 204);
    const page = await listMemories(wire.store, {});
    assert.deepEqual(
      (page.document as { memories: readonly { id: string }[] }).memories.map(
        (memory) => memory.id,
      ),
      [living],
      'the terminal stays off the living page',
    );
    const all = await listMemories(wire.store, { includeTerminals: true });
    assert.deepEqual(
      (all.document as { memories: readonly { id: string }[] }).memories.map((memory) => memory.id),
      [living, doomed],
      'the flag serves the terminals too, in serving order',
    );
  } finally {
    await wire.close();
  }
});
