import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { TokenGrant } from '../config/config.ts';
import { createApp } from './server.ts';
import { Registry } from './registry/registry.ts';

const SECRET_RW = `souv-${'2'.repeat(32)}`;
const SECRET_RO = `souv-${'3'.repeat(32)}`;
const TOKENS: readonly TokenGrant[] = [
  { agent: 'atlas', secret: SECRET_RW, store: 'atlas', mode: 'rw' },
  { agent: 'reader', secret: SECRET_RO, store: 'atlas', mode: 'ro' },
];

const LOOPBACK = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-rituals-test-'));
}

function boot(dir: string) {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: TOKENS, version: 'test' });
  return { registry, app, atlas: registry.create('atlas') };
}

test('checkin serves the hot block and the stats in one call', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    const first = atlas.store('first curated', { kind: 'note' });
    atlas.store('a plain memory', { kind: 'note' });
    atlas.setHot(first, true);
    const res = await app.request('/stores/atlas/checkin', {}, LOOPBACK);
    assert.equal(res.status, 200);
    const report = (await res.json()) as {
      hot: { content: string }[];
      stats: { memories: number; memories_by_status: Record<string, number> };
    };
    assert.deepEqual(
      report.hot.map((memory) => memory.content),
      ['first curated'],
    );
    assert.equal(report.stats.memories, 2);
    assert.deepEqual(report.stats.memories_by_status, { active: 1, hot: 1 });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkin on an empty store serves the empty block and zeroed stats', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/stores/atlas/checkin', {}, LOOPBACK);
    assert.equal(res.status, 200);
    const report = (await res.json()) as { hot: unknown[]; stats: { memories: number } };
    assert.deepEqual(report.hot, []);
    assert.equal(report.stats.memories, 0);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkin honors the limit — order guides attention, the cap truncates', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    const first = atlas.store('first hot', { kind: 'note' });
    const second = atlas.store('second hot', { kind: 'note' });
    atlas.setHot(first, true);
    atlas.setHot(second, true);
    const res = await app.request('/stores/atlas/checkin?limit=1', {}, LOOPBACK);
    const report = (await res.json()) as { hot: { content: string }[] };
    assert.equal(report.hot.length, 1);
    assert.equal(report.hot[0]?.content, 'second hot', 'newest first, then truncate');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a ro grant reads the rituals — reading the register is not writing it', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const ro = { authorization: `Bearer ${SECRET_RO}` };
    assert.equal((await app.request('/stores/atlas/checkin', { headers: ro })).status, 200);
    assert.equal((await app.request('/stores/atlas/checkout', { headers: ro })).status, 200);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkout serves the verdict — green on a clean store, findings on debts', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    const green = await app.request('/stores/atlas/checkout', {}, LOOPBACK);
    assert.equal(green.status, 200);
    const greenReport = (await green.json()) as {
      healthy: boolean;
      findings: unknown[];
      summary: { issues: number };
    };
    assert.equal(greenReport.healthy, true);
    assert.deepEqual(greenReport.findings, []);
    assert.equal(greenReport.summary.issues, 0);

    // Two isolated living memories: the consolidation debt (gated at >= 2).
    atlas.store('island one', { kind: 'note' });
    atlas.store('island two', { kind: 'note' });
    const red = await app.request('/stores/atlas/checkout', {}, LOOPBACK);
    const redReport = (await red.json()) as {
      healthy: boolean;
      findings: { check: string; detail: string; hint: string }[];
      summary: { checks: number; issues: number };
    };
    assert.equal(redReport.healthy, false);
    assert.ok(redReport.findings.some((finding) => finding.check === 'isolated_living'));
    assert.ok(
      redReport.findings.every((finding) => finding.hint.length > 0),
      'every finding teaches the pay-off',
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the rituals refuse a foreign store like every data route', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('other');
    const foreign = await app.request('/stores/other/checkin', {
      headers: { authorization: `Bearer ${SECRET_RW}` },
    });
    assert.equal(foreign.status, 403);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
