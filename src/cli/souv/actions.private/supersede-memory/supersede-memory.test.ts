import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { MAX_SUMMARY_LENGTH } from '../../../../modules.private/store/store.ts';
import { seedMemory } from '../../../../modules.private/cli/seed-memory/seed-memory.ts';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { supersedeMemory } from './supersede-memory.ts';

test('the revision serves the wire’s 201 — the successor exists, the old turns superseded', async () => {
  const wire = await bootTestWire();
  try {
    const old = await seedMemory(wire, { content: 'the draft', kind: 'note' });
    const answer = await supersedeMemory(wire.store, { id: old, content: 'the revised' });
    assert.equal(answer.exitCode, 0);
    const successor = (answer.document as { id: string }).id;
    assert.notEqual(successor, old);
    const servedOld = await httpCall(wire.store, { method: 'get', path: `/memories/${old}` });
    assert.equal((servedOld.document as { status: string }).status, 'superseded');
    const servedNew = await httpCall(wire.store, { method: 'get', path: `/memories/${successor}` });
    const node = servedNew.document as { content: string; kind: string };
    assert.equal(node.content, 'the revised');
    assert.equal(node.kind, 'note', 'the kind rides along when the body reclassifies not');
  } finally {
    await wire.close();
  }
});

test('the reclassification rides — the body’s kind wins over the inherited one', async () => {
  const wire = await bootTestWire();
  try {
    const old = await seedMemory(wire, { content: 'the draft', kind: 'note' });
    const answer = await supersedeMemory(wire.store, {
      id: old,
      content: 'the revised',
      kind: 'log',
    });
    assert.equal(answer.exitCode, 0);
    const successor = (answer.document as { id: string }).id;
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${successor}` });
    assert.equal((served.document as { kind: string }).kind, 'log');
  } finally {
    await wire.close();
  }
});

test('the source’s outgoing edges inherit verbatim when the body births none', async () => {
  const wire = await bootTestWire();
  try {
    const old = await seedMemory(wire, { content: 'the draft', kind: 'note' });
    const target = await seedMemory(wire, { content: 'the related', kind: 'note' });
    const linked = await httpCall(wire.store, {
      method: 'post',
      path: `/memories/${old}/link`,
      body: { to: target, kind: 'continues' },
    });
    assert.equal(linked.status, 201);
    const answer = await supersedeMemory(wire.store, { id: old, content: 'the revised' });
    assert.equal(answer.exitCode, 0);
    const successor = (answer.document as { id: string }).id;
    const served = await httpCall(wire.store, {
      method: 'get',
      path: `/memories/${successor}`,
      query: new URLSearchParams({ depth: '1' }),
    });
    const out = (served.document as { relations: { out: readonly { to_id: string }[] } }).relations
      .out;
    assert.equal(out.length, 1);
    assert.equal(out[0]?.to_id, target, 'the edge rides to the head, row by row');
  } finally {
    await wire.close();
  }
});

test('explicit relations replace the inheritance — the body births the successor’s own', async () => {
  const wire = await bootTestWire();
  try {
    const old = await seedMemory(wire, { content: 'the draft', kind: 'note' });
    const inherited = await seedMemory(wire, { content: 'the inherited', kind: 'note' });
    const fresh = await seedMemory(wire, { content: 'the fresh', kind: 'note' });
    await httpCall(wire.store, {
      method: 'post',
      path: `/memories/${old}/link`,
      body: { to: inherited, kind: 'continues' },
    });
    const answer = await supersedeMemory(wire.store, {
      id: old,
      content: 'the revised',
      relations: JSON.stringify([{ to: fresh, kind: 'corrects' }]),
    });
    assert.equal(answer.exitCode, 0);
    const successor = (answer.document as { id: string }).id;
    const served = await httpCall(wire.store, {
      method: 'get',
      path: `/memories/${successor}`,
      query: new URLSearchParams({ depth: '1' }),
    });
    const out = (
      served.document as { relations: { out: readonly { to_id: string; kind: string }[] } }
    ).relations.out;
    assert.deepEqual(
      out.map((edge) => ({ to: edge.to_id, kind: edge.kind })),
      [{ to: fresh, kind: 'corrects' }],
      'the explicit set wins over the inherited one',
    );
  } finally {
    await wire.close();
  }
});

test('the hot status transfers — the revision replaces what checkin would have served', async () => {
  const wire = await bootTestWire();
  try {
    const old = await seedMemory(wire, { content: 'the draft', kind: 'note', hot: true });
    const answer = await supersedeMemory(wire.store, { id: old, content: 'the revised' });
    assert.equal(answer.exitCode, 0);
    const successor = (answer.document as { id: string }).id;
    const served = await httpCall(wire.store, { method: 'get', path: `/memories/${successor}` });
    assert.equal((served.document as { status: string }).status, 'hot');
  } finally {
    await wire.close();
  }
});

test('the id is demanded locally — one envelope, no call', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await supersedeMemory(wire.store, { content: 'the revised' });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /id is missing/);
  } finally {
    await wire.close();
  }
});

test('the content is demanded locally — the successor’s, as the second argument', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await supersedeMemory(wire.store, { id: 'any' });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /content is missing/);
  } finally {
    await wire.close();
  }
});

test('a dot segment refuses before the URL is built — every verb’s gate', async () => {
  const wire = await bootTestWire();
  try {
    const dot = await supersedeMemory(wire.store, { id: '.', content: 'x' });
    assert.equal(dot.exitCode, 1);
    assert.match(String((dot.document as { error: string }).error), /dot segment/);
    const dotdot = await supersedeMemory(wire.store, { id: '..', content: 'x' });
    assert.equal(dotdot.exitCode, 1);
    assert.match(String((dotdot.document as { error: string }).error), /dot segment/);
  } finally {
    await wire.close();
  }
});

test('a JSON flag that does not parse refuses locally — the grammar stays the wire’s', async () => {
  const wire = await bootTestWire();
  try {
    const metadata = await supersedeMemory(wire.store, {
      id: 'any',
      content: 'x',
      metadata: '{oops',
    });
    assert.equal(metadata.exitCode, 1);
    assert.match(
      String((metadata.document as { error: string }).error),
      /--metadata must be one JSON document/,
    );
    const relations = await supersedeMemory(wire.store, {
      id: 'any',
      content: 'x',
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

test('the wire’s refusals are served verbatim — the unknown, the status fight, the ceiling', async () => {
  const wire = await bootTestWire();
  try {
    const unknown = await supersedeMemory(wire.store, {
      id: '0b9b7d1e-1111-4222-8333-444455556666',
      content: 'x',
    });
    assert.equal(unknown.exitCode, 1);
    assert.match(String((unknown.document as { error: string }).error), /not found/);
    const doomed = await seedMemory(wire, { content: 'born to die', kind: 'note' });
    const deprecated = await httpCall(wire.store, {
      method: 'post',
      path: `/memories/${doomed}/deprecate`,
    });
    assert.equal(deprecated.status, 204);
    const fight = await supersedeMemory(wire.store, { id: doomed, content: 'x' });
    assert.equal(fight.exitCode, 1);
    assert.match(
      String((fight.document as { error: string }).error),
      /cannot supersede a memory with status 'deprecated'/,
    );
    const ceiling = await supersedeMemory(wire.store, {
      id: randomUUID(),
      content: 'x',
      summary: 'y'.repeat(MAX_SUMMARY_LENGTH + 1),
    });
    assert.equal(ceiling.exitCode, 1);
    assert.match(String((ceiling.document as { error: string }).error), /summary/);
  } finally {
    await wire.close();
  }
});
