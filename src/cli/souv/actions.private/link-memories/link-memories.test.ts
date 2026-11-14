import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { seedMemory } from '../../../../modules.private/cli/seed-memory/seed-memory.ts';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { linkMemories } from './link-memories.ts';

test('the edge serves the wire’s 201 echo verbatim — and the edge exists', async () => {
  const wire = await bootTestWire();
  try {
    const from = await seedMemory(wire, { content: 'the source', kind: 'note' });
    const to = await seedMemory(wire, { content: 'the target', kind: 'note' });
    const answer = await linkMemories(wire.store, { id: from, target: to, kind: 'continues' });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { from_id: from, to_id: to, kind: 'continues' });
    const served = await httpCall(wire.store, {
      method: 'get',
      path: `/memories/${from}`,
      query: new URLSearchParams({ depth: '1' }),
    });
    const out = (
      served.document as { relations: { out: readonly { to_id: string; kind: string }[] } }
    ).relations.out;
    assert.equal(out.length, 1);
    assert.equal(out[0]?.to_id, to);
    assert.equal(out[0]?.kind, 'continues');
  } finally {
    await wire.close();
  }
});

test('the edge metadata rides — free-form JSON, judged by the wire', async () => {
  const wire = await bootTestWire();
  try {
    const from = await seedMemory(wire, { content: 'the source', kind: 'note' });
    const to = await seedMemory(wire, { content: 'the target', kind: 'note' });
    const answer = await linkMemories(wire.store, {
      id: from,
      target: to,
      kind: 'continues',
      metadata: '{"weight": 2}',
    });
    assert.equal(answer.exitCode, 0);
    const served = await httpCall(wire.store, {
      method: 'get',
      path: `/memories/${from}`,
      query: new URLSearchParams({ depth: '1' }),
    });
    const edge = (served.document as { relations: { out: readonly { metadata: unknown }[] } })
      .relations.out[0];
    assert.deepEqual(edge?.metadata, { weight: 2 });
  } finally {
    await wire.close();
  }
});

test('the gates judge locally — id, target, the born-classified kind, the JSON flag', async () => {
  const wire = await bootTestWire();
  try {
    const noId = await linkMemories(wire.store, { target: 'any', kind: 'x' });
    assert.equal(noId.exitCode, 1);
    assert.match(String((noId.document as { error: string }).error), /id is missing/);
    const noTarget = await linkMemories(wire.store, { id: 'any', kind: 'x' });
    assert.equal(noTarget.exitCode, 1);
    assert.match(String((noTarget.document as { error: string }).error), /target is missing/);
    const noKind = await linkMemories(wire.store, { id: 'any', target: 'any' });
    assert.equal(noKind.exitCode, 1);
    assert.match(
      String((noKind.document as { error: string }).error),
      /kind is missing.*born classified/,
    );
    const badJson = await linkMemories(wire.store, {
      id: 'any',
      target: 'any',
      kind: 'x',
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

test('the wire’s refusals are served verbatim — the self-edge and the unknown', async () => {
  const wire = await bootTestWire();
  try {
    const id = await seedMemory(wire, { content: 'the source', kind: 'note' });
    const self = await linkMemories(wire.store, { id, target: id, kind: 'continues' });
    assert.equal(self.exitCode, 1);
    assert.match(String((self.document as { error: string }).error), /self/);
    const unknown = await linkMemories(wire.store, {
      id: randomUUID(),
      target: id,
      kind: 'continues',
    });
    assert.equal(unknown.exitCode, 1);
    assert.match(String((unknown.document as { error: string }).error), /not found/);
  } finally {
    await wire.close();
  }
});
