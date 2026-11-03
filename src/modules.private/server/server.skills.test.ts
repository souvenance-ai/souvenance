import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { StoreGrant } from '../config/config.ts';
import { createApp } from './server.ts';
import { Registry } from './registry/registry.ts';

const SECRET_RW = `souv-${'4'.repeat(32)}`;
const TOKENS: readonly StoreGrant[] = [
  { agent: 'atlas', secret: SECRET_RW, store: 'atlas', mode: 'rw' },
];
const ATLAS = { authorization: `Bearer ${SECRET_RW}` };

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-server-skills-test-'));
}

function boot(dir: string) {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: TOKENS, management: [], version: 'test' });
  return { registry, app, atlas: registry.create('atlas') };
}

test('the skills index serves publicly — the start skill first, the version beside it (#82)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/skills');
    assert.equal(res.status, 200, 'a public door answers bare — no credential, no bucket');
    const index = (await res.json()) as {
      version: string;
      skills: { name: string; description: string }[];
    };
    assert.equal(index.version, 'test');
    assert.deepEqual(
      index.skills.map((skill) => skill.name),
      ['waking', 'setup'],
    );
    assert.match(index.skills[0]?.description ?? '', /waking posture/);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the item serves the shipped SKILL.md byte for byte — an installation is a copy (#82)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/skills/waking');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
    const shipped = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'skills', 'waking', 'SKILL.md'),
      'utf8',
    );
    assert.equal(await res.text(), shipped);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown skill serves the teaching 404 — the index is the way back (#82)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/skills/nope');
    assert.equal(res.status, 404);
    assert.deepEqual((await res.json()) as { error: string }, {
      error: 'no such skill — the index serves at /skills',
    });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkin serves the continuity line beside the data — the voice on a living store (#82)', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    const first = atlas.store('first curated', { kind: 'note' });
    atlas.setHot(first, true);
    const res = await app.request('/checkin', { headers: ATLAS });
    assert.equal(res.status, 200);
    const served = (await res.json()) as { guidance: { line: string; skill: string } };
    assert.deepEqual(served.guidance, {
      line: "the hot block is your last session — continue it, don't restart",
      skill: 'waking',
    });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkin on an empty store serves the unborn line — store-empty overrides always (#82)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/checkin', { headers: ATLAS });
    assert.equal(res.status, 200);
    const served = (await res.json()) as { guidance: { line: string; skill: string } };
    assert.deepEqual(served.guidance, {
      line: 'an empty store is an unborn individual — run setup',
      skill: 'setup',
    });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
