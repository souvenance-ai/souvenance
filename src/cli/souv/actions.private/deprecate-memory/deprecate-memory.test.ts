import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { seedMemory } from '../../../../modules.private/cli/seed-memory/seed-memory.ts';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { deprecateMemory } from './deprecate-memory.ts';

test('the retirement serves the echo of the gesture — the mute 204 spoken', async () => {
  const wire = await bootTestWire();
  try {
    const id = await seedMemory(wire, { content: 'born to die', kind: 'note' });
    const answer = await deprecateMemory(wire.store, { id });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { id, deprecated: true });
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${id}` });
    assert.equal((served.document as { status: string }).status, 'deprecated');
  } finally {
    await wire.close();
  }
});

test('the id is demanded locally — one envelope, no call', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await deprecateMemory(wire.store, {});
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /id is missing/);
  } finally {
    await wire.close();
  }
});

test('a dot segment refuses before the URL is built — every verb’s gate', async () => {
  const wire = await bootTestWire();
  try {
    for (const id of ['.', '..']) {
      const answer = await deprecateMemory(wire.store, { id });
      assert.equal(answer.exitCode, 1);
      assert.match(String((answer.document as { error: string }).error), /dot segment/);
    }
  } finally {
    await wire.close();
  }
});

test('the wire’s refusals are served verbatim — the unknown and the status fight', async () => {
  const wire = await bootTestWire();
  try {
    const unknown = await deprecateMemory(wire.store, { id: randomUUID() });
    assert.equal(unknown.exitCode, 1);
    assert.match(String((unknown.document as { error: string }).error), /not found/);
    const doomed = await seedMemory(wire, { content: 'twice retired', kind: 'note' });
    const first = await deprecateMemory(wire.store, { id: doomed });
    assert.equal(first.exitCode, 0);
    const fight = await deprecateMemory(wire.store, { id: doomed });
    assert.equal(fight.exitCode, 1);
    assert.match(
      String((fight.document as { error: string }).error),
      /cannot deprecate a memory with status 'deprecated'/,
    );
  } finally {
    await wire.close();
  }
});

test('a superseded memory is a terminal too — the fight is the wire’s voice', async () => {
  const wire = await bootTestWire();
  try {
    const old = await seedMemory(wire, { content: 'the draft', kind: 'note' });
    const revised = await httpCall(wire.store, {
      method: 'post',
      path: `/memories/${old}/supersede`,
      body: { content: 'the revised' },
    });
    assert.equal(revised.status, 201);
    const answer = await deprecateMemory(wire.store, { id: old });
    assert.equal(answer.exitCode, 1);
    assert.match(
      String((answer.document as { error: string }).error),
      /cannot deprecate a memory with status 'superseded'/,
    );
  } finally {
    await wire.close();
  }
});
