import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import {
  bootTestWire,
  type TestWire,
} from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { getMemory } from './get-memory.ts';

/** One memory seeded through the wire — the action under test stays the only subject. */
async function seed(wire: TestWire, content: string, kind = 'note'): Promise<string> {
  const answer = await httpCall(wire.store, {
    method: 'post',
    path: '/memories',
    body: { content, kind },
  });
  assert.equal(answer.status, 201, `the seed refused: ${JSON.stringify(answer.document)}`);
  return (answer.document as { id: string }).id;
}

test('the projection serves verbatim — the node, its kind, its status', async () => {
  const wire = await bootTestWire();
  try {
    const id = await seed(wire, 'the remembered thing');
    const answer = await getMemory(wire.store, { id });
    assert.equal(answer.exitCode, 0);
    const node = answer.document as { id: string; content: string; kind: string; status: string };
    assert.equal(node.id, id);
    assert.equal(node.content, 'the remembered thing');
    assert.equal(node.kind, 'note');
    assert.equal(node.status, 'active');
  } finally {
    await wire.close();
  }
});

test('an unknown id serves the wire\u2019s 404 verbatim', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await getMemory(wire.store, { id: randomUUID() });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /not found/);
  } finally {
    await wire.close();
  }
});

test('the id is demanded locally — one envelope, no call', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await getMemory(wire.store, {});
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /id is missing/);
  } finally {
    await wire.close();
  }
});

test('a malformed id is the wire\u2019s refusal — served verbatim', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await getMemory(wire.store, { id: 'not-a-uuid' });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /id/);
  } finally {
    await wire.close();
  }
});

test('--depth expands the out-edges — the projection walks', async () => {
  const wire = await bootTestWire();
  try {
    const from = await seed(wire, 'the source');
    const to = await seed(wire, 'the target');
    const linked = await httpCall(wire.store, {
      method: 'post',
      path: `/memories/${from}/link`,
      body: { to, kind: 'continues' },
    });
    assert.equal(linked.status, 201);
    const answer = await getMemory(wire.store, { id: from, depth: 1 });
    assert.equal(answer.exitCode, 0);
    const node = answer.document as { relations: { out: readonly { to_id: string }[] } };
    assert.equal(node.relations.out.length, 1);
    assert.equal(node.relations.out[0]?.to_id, to);
  } finally {
    await wire.close();
  }
});
