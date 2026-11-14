import assert from 'node:assert/strict';
import { test } from 'vitest';
import { seedMemory } from '../../../../modules.private/cli/seed-memory/seed-memory.ts';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { hotMemory } from '../hot-memory/hot-memory.ts';
import { linkMemories } from '../link-memories/link-memories.ts';
import { checkout } from './checkout.ts';

test('the empty store is healthy — nothing to serve, nothing owed', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await checkout(wire.store);
    assert.equal(answer.exitCode, 0);
    const report = answer.document as { healthy: boolean; findings: readonly unknown[] };
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    await wire.close();
  }
});

test('the red verdict names the debts, each with its payment hint', async () => {
  const wire = await bootTestWire();
  try {
    await seedMemory(wire, { content: 'the first', kind: 'note' });
    await seedMemory(wire, { content: 'the second', kind: 'note' });
    const answer = await checkout(wire.store);
    assert.equal(answer.exitCode, 0);
    const report = answer.document as {
      healthy: boolean;
      findings: readonly { check: string; detail: string; hint: string }[];
      summary: {
        checks: number;
        issues: number;
        memories: number;
        hot_memories: number;
        edges: number;
      };
    };
    assert.equal(report.healthy, false);
    const checks = report.findings.map((finding) => finding.check);
    assert.deepEqual(
      checks.sort(),
      ['isolated_living', 'no_hot'],
      'the uncured register and the islands are the debts',
    );
    for (const finding of report.findings) {
      assert.ok(finding.detail.length > 0);
      assert.ok(finding.hint.length > 0, 'each debt carries its payment');
    }
    assert.equal(report.summary.memories, 2);
    assert.equal(report.summary.hot_memories, 0);
    assert.equal(report.summary.edges, 0);
  } finally {
    await wire.close();
  }
});

test('the round-trip: store → red → pay → green — the light the agent watches', async () => {
  const wire = await bootTestWire();
  try {
    const first = await seedMemory(wire, { content: 'the session note', kind: 'note' });
    const second = await seedMemory(wire, { content: 'the session fact', kind: 'fact' });
    const red = await checkout(wire.store);
    assert.equal((red.document as { healthy: boolean }).healthy, false, 'the session opens a debt');
    // The payment rides the shipped verbs: a hot block exists, the
    // islands hold an edge.
    const heated = await hotMemory(wire.store, { id: first, verdict: 'on' });
    assert.equal(heated.exitCode, 0);
    assert.deepEqual(heated.document, { id: first, hot: true });
    const linked = await linkMemories(wire.store, { id: first, target: second, kind: 'continues' });
    assert.equal(linked.exitCode, 0);
    assert.deepEqual(linked.document, { from_id: first, to_id: second, kind: 'continues' });
    const green = await checkout(wire.store);
    assert.equal(green.exitCode, 0);
    const report = green.document as { healthy: boolean; findings: readonly unknown[] };
    assert.equal(report.healthy, true, 'every debt is paid');
    assert.deepEqual(report.findings, []);
  } finally {
    await wire.close();
  }
});

test('a duplicate title is a debt too — two living memories under one heading', async () => {
  const wire = await bootTestWire();
  try {
    const first = await seedMemory(wire, {
      content: '# the plan\nthe body',
      kind: 'note',
      hot: true,
    });
    const second = await seedMemory(wire, {
      content: '# the plan\nanother body',
      kind: 'note',
      hot: true,
    });
    // The other debts are paid in the seed: the block is hot, the pair
    // holds an edge — only the title duplication is left to name.
    const linked = await linkMemories(wire.store, {
      id: first,
      target: second,
      kind: 'duplicates',
    });
    assert.equal(linked.exitCode, 0);
    const answer = await checkout(wire.store);
    const report = answer.document as {
      healthy: boolean;
      findings: readonly { check: string }[];
    };
    assert.equal(report.healthy, false);
    assert.deepEqual(
      report.findings.map((finding) => finding.check),
      ['duplicate_titles'],
    );
  } finally {
    await wire.close();
  }
});
