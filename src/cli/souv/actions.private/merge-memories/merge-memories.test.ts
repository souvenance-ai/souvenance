import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { MAX_SUMMARY_LENGTH } from '../../../../modules.private/store/store.ts';
import { seedMemory } from '../../../../modules.private/cli/seed-memory/seed-memory.ts';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { mergeMemories } from './merge-memories.ts';

test('the fusion serves the wire’s 201 — the head exists, the sources die merged, bridged as provenance', async () => {
  const wire = await bootTestWire();
  try {
    const first = await seedMemory(wire, { content: 'the first', kind: 'note' });
    const second = await seedMemory(wire, { content: 'the second', kind: 'note' });
    const answer = await mergeMemories(wire.store, {
      ids: [first, second],
      content: 'the fused',
    });
    assert.equal(answer.exitCode, 0);
    const head = (answer.document as { id: string }).id;
    const servedHead = await httpCall(wire.store, { method: 'get', path: `/memories/${head}` });
    const headNode = servedHead.document as { content: string; kind: string };
    assert.equal(headNode.content, 'the fused');
    assert.equal(headNode.kind, 'note', 'the kind inherits when the sources agree');
    const servedFirst = await httpCall(wire.store, {
      method: 'get',
      path: `/memories/${first}`,
      query: new URLSearchParams({ depth: '1' }),
    });
    const firstNode = servedFirst.document as {
      status: string;
      relations: { out: readonly { to_id: string; kind: string }[] };
    };
    assert.equal(firstNode.status, 'merged');
    assert.deepEqual(
      firstNode.relations.out.map((edge) => ({ to: edge.to_id, kind: edge.kind })),
      [{ to: head, kind: 'merges' }],
      'the source keeps its merges bridge',
    );
  } finally {
    await wire.close();
  }
});

test('the ≥2 is the wire’s verdict — one source, its 400 teaching verbatim', async () => {
  const wire = await bootTestWire();
  try {
    const lone = await seedMemory(wire, { content: 'the lone', kind: 'note' });
    const answer = await mergeMemories(wire.store, { ids: [lone], content: 'the fused' });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /at least 2 memories/);
    // The zero-source spelling is its own: the strict body names the key
    // it lacks — the facade's "at least 2 memories" is the ONE-source
    // verdict beside it.
    const absent = await mergeMemories(wire.store, { content: 'the fused' });
    assert.equal(absent.exitCode, 1);
    assert.match(String((absent.document as { error: string }).error), /ids/i);
  } finally {
    await wire.close();
  }
});

test('the kind the disagreeing sources demand — the 400 names the candidates, verbatim', async () => {
  const wire = await bootTestWire();
  try {
    const decision = await seedMemory(wire, { content: 'the decision', kind: 'decision' });
    const note = await seedMemory(wire, { content: 'the note', kind: 'note' });
    const refused = await mergeMemories(wire.store, {
      ids: [decision, note],
      content: 'the fused',
    });
    assert.equal(refused.exitCode, 1);
    assert.match(
      String((refused.document as { error: string }).error),
      /sources disagree on kind \(decision, note\) — pass kind to classify the fusion/,
    );
    const classified = await mergeMemories(wire.store, {
      ids: [decision, note],
      content: 'the fused',
      kind: 'log',
    });
    assert.equal(classified.exitCode, 0);
    const head = (classified.document as { id: string }).id;
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${head}` });
    assert.equal((served.document as { kind: string }).kind, 'log');
  } finally {
    await wire.close();
  }
});

test('the content is demanded locally — one envelope, no call', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await mergeMemories(wire.store, { ids: ['any', 'other'] });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /content is missing/);
  } finally {
    await wire.close();
  }
});

test('the wire’s refusals are served verbatim — the unknown source, the ceiling, the metadata gate', async () => {
  const wire = await bootTestWire();
  try {
    const known = await seedMemory(wire, { content: 'the known', kind: 'note' });
    const unknown = await mergeMemories(wire.store, {
      ids: [known, randomUUID()],
      content: 'the fused',
    });
    assert.equal(unknown.exitCode, 1);
    assert.match(String((unknown.document as { error: string }).error), /not found/);
    const ceiling = await mergeMemories(wire.store, {
      ids: [known, await seedMemory(wire, { content: 'the other', kind: 'note' })],
      content: 'the fused',
      summary: 'x'.repeat(MAX_SUMMARY_LENGTH + 1),
    });
    assert.equal(ceiling.exitCode, 1);
    assert.match(String((ceiling.document as { error: string }).error), /summary/);
    const badJson = await mergeMemories(wire.store, {
      ids: [known, known],
      content: 'the fused',
      metadata: '{oops',
    });
    assert.equal(badJson.exitCode, 1);
    assert.match(
      String((badJson.document as { error: string }).error),
      /--metadata must be one JSON document/,
    );
  } finally {
    await wire.close();
  }
});

test('the hot status unions — a hot source heats the fusion', async () => {
  const wire = await bootTestWire();
  try {
    const hot = await seedMemory(wire, { content: 'the hot', kind: 'note', hot: true });
    const cold = await seedMemory(wire, { content: 'the cold', kind: 'note' });
    const answer = await mergeMemories(wire.store, { ids: [hot, cold], content: 'the fused' });
    assert.equal(answer.exitCode, 0);
    const head = (answer.document as { id: string }).id;
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${head}` });
    assert.equal((served.document as { status: string }).status, 'hot');
  } finally {
    await wire.close();
  }
});
