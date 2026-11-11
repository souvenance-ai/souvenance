import assert from 'node:assert/strict';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { MAX_SUMMARY_LENGTH } from '../../../../modules.private/store/store.ts';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { storeMemory } from './store-memory.ts';

test('the birth gesture serves the wire\u2019s 201 verbatim — the memory exists', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await storeMemory(wire.store, { content: 'hello', kind: 'note' });
    assert.equal(answer.exitCode, 0);
    const { id } = answer.document as { id: string };
    assert.match(id, /^[0-9a-f-]{36}$/);
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${id}` });
    assert.equal(served.status, 200);
    assert.equal((served.document as { content: string }).content, 'hello');
    assert.equal((served.document as { kind: string }).kind, 'note');
  } finally {
    await wire.close();
  }
});

test('the content is demanded locally — one envelope, no call', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await storeMemory(wire.store, { kind: 'note' });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /content is missing/);
    const page = await httpCall(wire.store, { method: 'get', path: '/memories' });
    assert.equal((page.document as { memories: unknown[] }).memories.length, 0);
  } finally {
    await wire.close();
  }
});

test('the kind is demanded locally — a memory is born classified', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await storeMemory(wire.store, { content: 'hello' });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /kind is missing/);
  } finally {
    await wire.close();
  }
});

test('a JSON flag that does not parse refuses locally — the grammar stays the wire\u2019s', async () => {
  const wire = await bootTestWire();
  try {
    const metadata = await storeMemory(wire.store, {
      content: 'hello',
      kind: 'note',
      metadata: '{oops',
    });
    assert.equal(metadata.exitCode, 1);
    assert.match(
      String((metadata.document as { error: string }).error),
      /--metadata must be one JSON document/,
    );
    const relations = await storeMemory(wire.store, {
      content: 'hello',
      kind: 'note',
      relations: '[oops',
    });
    assert.equal(relations.exitCode, 1);
    assert.match(
      String((relations.document as { error: string }).error),
      /--relations must be one JSON document/,
    );
  } finally {
    await wire.close();
  }
});

test('the wire\u2019s ceilings and grammar are served verbatim — the envelope, exit 1', async () => {
  const wire = await bootTestWire();
  try {
    const ceiling = await storeMemory(wire.store, {
      content: 'hello',
      kind: 'note',
      summary: 'x'.repeat(MAX_SUMMARY_LENGTH + 1),
    });
    assert.equal(ceiling.exitCode, 1);
    assert.match(String((ceiling.document as { error: string }).error), /summary/);
    const arrays = await storeMemory(wire.store, {
      content: 'hello',
      kind: 'note',
      metadata: '{"topic": [1, 2]}',
    });
    assert.equal(arrays.exitCode, 1);
    assert.match(String((arrays.document as { error: string }).error), /values may not be arrays/);
  } finally {
    await wire.close();
  }
});

test('the birth curation lands hot — one gesture, no second call', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await storeMemory(wire.store, { content: 'hello', kind: 'note', hot: true });
    assert.equal(answer.exitCode, 0);
    const { id } = answer.document as { id: string };
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${id}` });
    assert.equal((served.document as { status: string }).status, 'hot');
  } finally {
    await wire.close();
  }
});
