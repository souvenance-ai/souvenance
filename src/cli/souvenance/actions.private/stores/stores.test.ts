import assert from 'node:assert/strict';
import { test } from 'vitest';
import { onWire, UNREACHABLE } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { storesCreate, storesDelete, storesDescribe, storesFork, storesList } from './stores.ts';
import { DOT_STORE_REFUSAL } from '../store-doors/store-doors.ts';

test('create serves the wire\u2019s 201 verbatim — the name back', async () => {
  await onWire(async (wire) => {
    const answer = await storesCreate(wire.management, { name: 'alpha' });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { name: 'alpha' });
  });
});

test('create forwards the collision\u2019s 409 verbatim — the wire\u2019s own teaching', async () => {
  await onWire(async (wire) => {
    const answer = await storesCreate(wire.management, { name: wire.storeName });
    assert.equal(answer.exitCode, 1);
    assert.deepEqual(answer.document, {
      error: `store "${wire.storeName}" already exists`,
    });
  });
});

test('create\u2019s missing name refuses locally — the verb\u2019s own voice', async () => {
  await onWire(async (wire) => {
    const answer = await storesCreate(wire.management, {});
    assert.equal(answer.exitCode, 1);
    assert.deepEqual(answer.document, {
      error: 'the store name is missing — pass it as the command\u2019s first argument',
    });
  });
});

test('list serves the descriptors verbatim — the registry\u2019s inventory, the paths never', async () => {
  await onWire(async (wire) => {
    const answer = await storesList(wire.management);
    assert.equal(answer.exitCode, 0);
    const descriptors = answer.document as readonly { name: string; stats: unknown }[];
    assert.ok(descriptors.some((descriptor) => descriptor.name === wire.storeName));
    assert.ok(
      descriptors.every((descriptor) => !('dbPath' in descriptor) && !('path' in descriptor)),
      'the v0.1 dbPath leak stays dead',
    );
  });
});

test('describe serves the descriptor — the name and the five-key stats ledger', async () => {
  await onWire(async (wire) => {
    const answer = await storesDescribe(wire.management, { name: wire.storeName });
    assert.equal(answer.exitCode, 0);
    const descriptor = answer.document as {
      name: string;
      stats: Record<string, unknown>;
    };
    assert.equal(descriptor.name, wire.storeName);
    assert.deepEqual(Object.keys(descriptor.stats).sort(), [
      'edges',
      'edges_by_kind',
      'memories',
      'memories_by_kind',
      'memories_by_status',
    ]);
  });
});

test('describe forwards the unknown store\u2019s 404 verbatim', async () => {
  await onWire(async (wire) => {
    const answer = await storesDescribe(wire.management, { name: 'ghost' });
    assert.equal(answer.exitCode, 1);
    assert.deepEqual(answer.document, { error: 'no store "ghost" in the registry' });
  });
});

test('a dot-segment name refuses locally, before any call — the transport\u2019s own words', async () => {
  // The binding reaches nothing: a gate that failed to precede the call
  // would answer the unreachable envelope, not the dot refusal.
  const answer = await storesDescribe(UNREACHABLE, { name: '..' });
  assert.equal(answer.exitCode, 1);
  assert.deepEqual(answer.document, { error: DOT_STORE_REFUSAL });
});

test('fork serves the composed name verbatim — <source>-fork on the wire', async () => {
  await onWire(async (wire) => {
    const answer = await storesFork(wire.management, { source: wire.storeName });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { name: `${wire.storeName}-fork` });
  });
});

test('fork serves the named child verbatim — the body\u2019s name wins', async () => {
  await onWire(async (wire) => {
    const answer = await storesFork(wire.management, { source: wire.storeName, target: 'copy' });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { name: 'copy' });
  });
});

test('fork forwards the unknown source\u2019s 404 verbatim — and carries no grant chain', async () => {
  await onWire(async (wire) => {
    const answer = await storesFork(wire.management, { source: 'ghost' });
    assert.equal(answer.exitCode, 1);
    assert.deepEqual(answer.document, { error: 'no store "ghost" in the registry' });
  });
});

test('delete\u2019s 204 serves the gesture\u2019s echo — {name, deleted: true}', async () => {
  await onWire(async (wire) => {
    await storesCreate(wire.management, { name: 'alpha' });
    const answer = await storesDelete(wire.management, { name: 'alpha' });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { name: 'alpha', deleted: true });
    const remaining = await storesList(wire.management);
    const descriptors = remaining.document as readonly { name: string }[];
    assert.ok(!descriptors.some((descriptor) => descriptor.name === 'alpha'));
  });
});

test('delete forwards the unknown store\u2019s 404 verbatim', async () => {
  await onWire(async (wire) => {
    const answer = await storesDelete(wire.management, { name: 'ghost' });
    assert.equal(answer.exitCode, 1);
    assert.deepEqual(answer.document, { error: 'no store "ghost" in the registry' });
  });
});
