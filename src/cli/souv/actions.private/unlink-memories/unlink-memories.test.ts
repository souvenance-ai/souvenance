import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import {
  bootTestWire,
  type TestWire,
} from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { unlinkMemories } from './unlink-memories.ts';

/** One memory seeded through the wire — the action under test stays the only subject. */
async function seed(wire: TestWire, body: Record<string, unknown>): Promise<string> {
  const answer = await httpCall(wire.store, { method: 'post', path: '/memories', body });
  assert.equal(answer.status, 201, `the seed refused: ${JSON.stringify(answer.document)}`);
  return (answer.document as { id: string }).id;
}

/** One edge linked through the wire — the unlink's subject, born classified. */
async function link(wire: TestWire, from: string, to: string, kind: string): Promise<void> {
  const answer = await httpCall(wire.store, {
    method: 'post',
    path: `/memories/${from}/link`,
    body: { to, kind },
  });
  assert.equal(answer.status, 201, `the link refused: ${JSON.stringify(answer.document)}`);
}

test('the single edge is gone — the echo of the gesture, the projection empty', async () => {
  const wire = await bootTestWire();
  try {
    const from = await seed(wire, { content: 'the source', kind: 'note' });
    const to = await seed(wire, { content: 'the target', kind: 'note' });
    await link(wire, from, to, 'continues');
    const answer = await unlinkMemories(wire.store, { id: from, target: to });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, { from_id: from, to_id: to, unlinked: true });
    const served = await httpCall(wire.store, {
      method: 'get',
      path: `/memories/${from}`,
      query: new URLSearchParams({ depth: '1' }),
    });
    assert.equal(
      (served.document as { relations: { out: readonly unknown[] } }).relations.out.length,
      0,
    );
  } finally {
    await wire.close();
  }
});

test('the ambiguity is the wire’s verdict — the 400 names the candidate kinds, verbatim', async () => {
  const wire = await bootTestWire();
  try {
    const from = await seed(wire, { content: 'the source', kind: 'note' });
    const to = await seed(wire, { content: 'the target', kind: 'note' });
    await link(wire, from, to, 'extends');
    await link(wire, from, to, 'references');
    const ambiguous = await unlinkMemories(wire.store, { id: from, target: to });
    assert.equal(ambiguous.exitCode, 1);
    assert.match(
      String((ambiguous.document as { error: string }).error),
      /ambiguous: 2 edges between .*pass kind: extends, references/,
    );
    // The kind picks: the named edge leaves, its sibling stays.
    const picked = await unlinkMemories(wire.store, { id: from, target: to, kind: 'extends' });
    assert.equal(picked.exitCode, 0);
    const served = await httpCall(wire.store, {
      method: 'get',
      path: `/memories/${from}`,
      query: new URLSearchParams({ depth: '1' }),
    });
    const out = (served.document as { relations: { out: readonly { kind: string }[] } }).relations
      .out;
    assert.deepEqual(
      out.map((edge) => edge.kind),
      ['references'],
    );
  } finally {
    await wire.close();
  }
});

test('the gates judge locally — the id and the target, no call', async () => {
  const wire = await bootTestWire();
  try {
    const noId = await unlinkMemories(wire.store, { target: 'any' });
    assert.equal(noId.exitCode, 1);
    assert.match(String((noId.document as { error: string }).error), /id is missing/);
    const noTarget = await unlinkMemories(wire.store, { id: 'any' });
    assert.equal(noTarget.exitCode, 1);
    assert.match(String((noTarget.document as { error: string }).error), /target is missing/);
  } finally {
    await wire.close();
  }
});

test('the wire’s refusals are served verbatim — the unknown memory', async () => {
  const wire = await bootTestWire();
  try {
    const id = await seed(wire, { content: 'the source', kind: 'note' });
    const unknown = await unlinkMemories(wire.store, { id: randomUUID(), target: id });
    assert.equal(unknown.exitCode, 1);
    assert.match(String((unknown.document as { error: string }).error), /not found/);
    const absent = await unlinkMemories(wire.store, { id, target: randomUUID() });
    assert.equal(absent.exitCode, 1);
    assert.match(
      String((absent.document as { error: string }).error),
      /no.*edge|not found|absent/i,
    );
  } finally {
    await wire.close();
  }
});
