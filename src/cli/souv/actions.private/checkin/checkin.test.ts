import assert from 'node:assert/strict';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import {
  bootTestWire,
  type TestWire,
} from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { checkin } from './checkin.ts';

/** One memory seeded through the wire — the action under test stays the only subject. */
async function seed(wire: TestWire, body: Record<string, unknown>): Promise<string> {
  const answer = await httpCall(wire.store, { method: 'post', path: '/memories', body });
  assert.equal(answer.status, 201, `the seed refused: ${JSON.stringify(answer.document)}`);
  return (answer.document as { id: string }).id;
}

/** The #34 guard's gate: distinct created_at — ms ties leave the serving order undefined. */
async function nextMillisecond(): Promise<void> {
  const gate = Date.now() + 2;
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
}

test('the report serves verbatim — the hot block newest first, the stats, the waking voice', async () => {
  const wire = await bootTestWire();
  try {
    const first = await seed(wire, { content: '# first', kind: 'note', hot: true });
    await nextMillisecond();
    const second = await seed(wire, { content: '# second', kind: 'note', hot: true });
    await nextMillisecond();
    const third = await seed(wire, { content: '# third', kind: 'note', hot: true });
    await seed(wire, { content: 'the cold one', kind: 'note' });
    const answer = await checkin(wire.store, {});
    assert.equal(answer.exitCode, 0);
    const report = answer.document as {
      hot: readonly { id: string }[];
      stats: { memories: number; memories_by_status: Record<string, number> };
      guidance?: { line: string; skill: string };
    };
    assert.deepEqual(
      report.hot.map((memory) => memory.id),
      [third, second, first],
      'newest first',
    );
    assert.equal(report.stats.memories, 4);
    assert.equal(report.stats.memories_by_status['hot'], 3);
    assert.ok(
      report.guidance !== undefined && report.guidance.line.length > 0,
      'the waking voice rides',
    );
  } finally {
    await wire.close();
  }
});

test('--limit trims the session block — an explicit block of two of three', async () => {
  const wire = await bootTestWire();
  try {
    const first = await seed(wire, { content: '# a', kind: 'note', hot: true });
    await nextMillisecond();
    const second = await seed(wire, { content: '# b', kind: 'note', hot: true });
    await nextMillisecond();
    const third = await seed(wire, { content: '# c', kind: 'note', hot: true });
    const answer = await checkin(wire.store, { limit: 2 });
    assert.equal(answer.exitCode, 0);
    const report = answer.document as { hot: readonly { id: string }[] };
    assert.deepEqual(
      report.hot.map((memory) => memory.id),
      [third, second],
    );
    assert.notEqual(report.hot[0]?.id, first, 'the block trims the newest, the order holds');
  } finally {
    await wire.close();
  }
});

test('the limit has no ceiling — 5000 is an honest block, not a cap to refuse', async () => {
  const wire = await bootTestWire();
  try {
    await seed(wire, { content: '# only', kind: 'note', hot: true });
    const answer = await checkin(wire.store, { limit: 5000 });
    assert.equal(answer.exitCode, 0);
    assert.equal((answer.document as { hot: readonly unknown[] }).hot.length, 1);
  } finally {
    await wire.close();
  }
});

test('a malformed limit rides to the wire’s judge — the 400 verbatim', async () => {
  const wire = await bootTestWire();
  try {
    const fraction = await checkin(wire.store, { limit: 2.5 });
    assert.equal(fraction.exitCode, 1);
    assert.match(String((fraction.document as { error: string }).error), /limit/i);
    const zero = await checkin(wire.store, { limit: 0 });
    assert.equal(zero.exitCode, 1);
    assert.match(String((zero.document as { error: string }).error), /limit/i);
  } finally {
    await wire.close();
  }
});

test('the empty store serves the empty block — the unborn line rides', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await checkin(wire.store, {});
    assert.equal(answer.exitCode, 0);
    const report = answer.document as {
      hot: readonly unknown[];
      stats: { memories: number };
      guidance?: { line: string };
    };
    assert.deepEqual(report.hot, []);
    assert.equal(report.stats.memories, 0);
    assert.ok(report.guidance !== undefined, 'the waking voice overrides on the unborn store');
  } finally {
    await wire.close();
  }
});
