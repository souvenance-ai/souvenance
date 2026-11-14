import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { seedMemory } from '../../../../modules.private/cli/seed-memory/seed-memory.ts';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { hotMemory } from './hot-memory.ts';

test('on lands the memory in the hot block — the echo speaks the verdict', async () => {
  const wire = await bootTestWire();
  try {
    const id = await seedMemory(wire, { content: 'the morning note', kind: 'note' });
    const answer = await hotMemory(wire.store, { id, verdict: 'on' });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { id, hot: true });
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${id}` });
    assert.equal((served.document as { status: string }).status, 'hot');
  } finally {
    await wire.close();
  }
});

test('off cools it back to active — the one reversible edge', async () => {
  const wire = await bootTestWire();
  try {
    const id = await seedMemory(wire, { content: 'the morning note', kind: 'note', hot: true });
    const answer = await hotMemory(wire.store, { id, verdict: 'off' });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { id, hot: false });
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${id}` });
    assert.equal((served.document as { status: string }).status, 'active');
  } finally {
    await wire.close();
  }
});

test('the verdict is judged locally — missing teaches, a foreign word teaches, no call', async () => {
  const wire = await bootTestWire();
  try {
    const missing = await hotMemory(wire.store, { id: 'any' });
    assert.equal(missing.exitCode, 1);
    assert.match(
      String((missing.document as { error: string }).error),
      /verdict is missing.*on or off/,
    );
    const foreign = await hotMemory(wire.store, { id: 'any', verdict: 'maybe' });
    assert.equal(foreign.exitCode, 1);
    assert.match(String((foreign.document as { error: string }).error), /verdict is not ours/);
    const empty = await hotMemory(wire.store, { id: 'any', verdict: '' });
    assert.equal(empty.exitCode, 1);
    assert.match(String((empty.document as { error: string }).error), /verdict is missing/);
  } finally {
    await wire.close();
  }
});

test('the wire’s refusals are served verbatim — the unknown and the terminal fight', async () => {
  const wire = await bootTestWire();
  try {
    const unknown = await hotMemory(wire.store, { id: randomUUID(), verdict: 'on' });
    assert.equal(unknown.exitCode, 1);
    assert.match(String((unknown.document as { error: string }).error), /not found/);
    const old = await seedMemory(wire, { content: 'the draft', kind: 'note' });
    const revised = await httpCall(wire.store, {
      method: 'post',
      path: `/memories/${old}/supersede`,
      body: { content: 'the revised' },
    });
    assert.equal(revised.status, 201);
    const fight = await hotMemory(wire.store, { id: old, verdict: 'on' });
    assert.equal(fight.exitCode, 1);
    assert.match(
      String((fight.document as { error: string }).error),
      /cannot setHot a memory with status 'superseded'/,
    );
  } finally {
    await wire.close();
  }
});
