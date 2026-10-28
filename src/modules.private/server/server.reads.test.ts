import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { TokenGrant } from '../config/config.ts';
import { createApp } from './server.ts';
import { Registry } from './registry/registry.ts';
import type { Store } from '../store/store.ts';

const ATLAS_SECRET = `souv-${'f'.repeat(32)}`;
const OTHER_SECRET = `souv-${'1'.repeat(32)}`;
const TOKENS: readonly TokenGrant[] = [
  { agent: 'atlas', secret: ATLAS_SECRET, store: 'atlas', mode: 'rw' },
  { agent: 'other', secret: OTHER_SECRET, store: 'other', mode: 'rw' },
];

const ATLAS = { authorization: `Bearer ${ATLAS_SECRET}` };

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-reads-test-'));
}

function boot(dir: string): {
  registry: Registry;
  app: ReturnType<typeof createApp>;
  atlas: Store;
} {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: TOKENS, version: 'test' });
  return { registry, app, atlas: registry.create('atlas') };
}

async function get(
  app: ReturnType<typeof createApp>,
  path: string,
  headers: Record<string, string> = ATLAS,
): Promise<{ status: number; body: any }> {
  // The loopback env stands in for the node adapter's socket — the
  // operator path (no bearer) needs a seen peer since the fail-closed
  // fix; bearer requests ignore it.
  const res = await app.request(
    path,
    { headers },
    { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** The #34-family guard: the next write lands in a strictly later millisecond. */
async function nextMillisecond(): Promise<void> {
  const gate = Date.now() + 2;
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, gate - Date.now())));
}

function jsonQuery(params: Record<string, string | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : [value]) search.append(key, one);
  }
  return search.toString();
}

/** Seeds a store deterministically: kind and metadata ride the content. */
function seed(
  store: Store,
  content: string,
  options: { kind: string; metadata?: Record<string, unknown> },
): string {
  return store.store(content, options);
}

test('the list pages by the opaque cursor — {memories, next_after}, null when exhausted', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    // The seeds must not share a millisecond: same-ms ties order by id —
    // random UUIDs, a coin toss per runner (#34 family, fired on CI).
    for (const content of ['one', 'two', 'three', 'four']) {
      seed(atlas, content, { kind: 'note' });
      await nextMillisecond();
    }
    const first = await get(app, `/stores/atlas/memories?limit=2`);
    assert.equal(first.status, 200);
    assert.equal(first.body.memories.length, 2);
    assert.equal(first.body.memories[0].content, 'four', 'serving order is newest first');
    assert.equal(typeof first.body.next_after, 'string');
    const second = await get(
      app,
      `/stores/atlas/memories?limit=2&after=${encodeURIComponent(first.body.next_after)}`,
    );
    assert.equal(second.status, 200);
    assert.deepEqual(
      second.body.memories.map((memory: { content: string }) => memory.content),
      ['two', 'one'],
    );
    assert.equal(second.body.next_after, null, 'the page is exhausted');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('limit absent takes the server default (Q18 revised) — 100, and the cursor stays honest past it', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    for (let index = 0; index < 101; index++) seed(atlas, `memory ${index}`, { kind: 'note' });
    // Silent page: 100, NOT the facade's own default of 20, and the
    // cursor admits there is more (the review probe, pinned).
    const first = await get(app, `/stores/atlas/memories`);
    assert.equal(first.body.memories.length, 100);
    assert.equal(typeof first.body.next_after, 'string');
    const second = await get(
      app,
      `/stores/atlas/memories?after=${encodeURIComponent(first.body.next_after)}`,
    );
    assert.equal(second.body.memories.length, 1);
    assert.equal(second.body.next_after, null);
    // The cap still judges only the explicit.
    assert.equal((await get(app, `/stores/atlas/memories?limit=1001`)).status, 400);
    assert.equal((await get(app, `/stores/atlas/memories?limit=1000`)).status, 200);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an explicit limit past the cap refuses 400 — the cap judges only the explicit', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    seed(atlas, 'one', { kind: 'note' });
    assert.equal((await get(app, `/stores/atlas/memories?limit=1001`)).status, 400);
    assert.equal((await get(app, `/stores/atlas/memories?limit=0`)).status, 400);
    assert.equal((await get(app, `/stores/atlas/memories?limit=abc`)).status, 400);
    assert.equal(
      (await get(app, `/stores/atlas/memories?limit=1000`)).status,
      200,
      'at the cap passes',
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repeated kind params narrow with IN semantics (Q17)', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    seed(atlas, 'a note', { kind: 'note' });
    seed(atlas, 'a decision', { kind: 'decision' });
    seed(atlas, 'a dream', { kind: 'dream' });
    const query = jsonQuery({ kind: ['note', 'dream'] });
    const { body } = await get(app, `/stores/atlas/memories?${query}`);
    assert.deepEqual(body.memories.map((memory: { kind: string }) => memory.kind).sort(), [
      'dream',
      'note',
    ]);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the metadata filter is one URL-encoded JSON object — typed equality', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    seed(atlas, 'the project memory', { kind: 'note', metadata: { project: 'souvenance' } });
    seed(atlas, 'another memory', { kind: 'note', metadata: { project: 'other' } });
    const filter = jsonQuery({ metadata: JSON.stringify({ project: 'souvenance' }) });
    const { body } = await get(app, `/stores/atlas/memories?${filter}`);
    assert.equal(body.memories.length, 1);
    assert.equal(body.memories[0].content, 'the project memory');
    // A number is not the string of the number — typed equality (Q3).
    seed(atlas, 'a count', { kind: 'note', metadata: { count: 42 } });
    const numeric = await get(
      app,
      `/stores/atlas/memories?${jsonQuery({ metadata: JSON.stringify({ count: '42' }) })}`,
    );
    assert.equal(numeric.body.memories.length, 0, 'the string 42 does not match the number 42');
    // Bad JSON and non-objects refuse with the teaching.
    assert.equal((await get(app, `/stores/atlas/memories?metadata=not-json`)).status, 400);
    assert.equal(
      (await get(app, `/stores/atlas/memories?${jsonQuery({ metadata: JSON.stringify([1]) })}`))
        .status,
      400,
    );
    // A path breaking the grammar refuses through the facade's own voice.
    assert.equal(
      (
        await get(
          app,
          `/stores/atlas/memories?${jsonQuery({ metadata: JSON.stringify({ 'bad path!': 1 }) })}`,
        )
      ).status,
      400,
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the terminals join only when include_terminals is present', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    const old = seed(atlas, 'the old truth', { kind: 'note' });
    atlas.supersede(old, 'the new truth', {});
    const living = await get(app, `/stores/atlas/memories`);
    assert.equal(living.body.memories.length, 1, 'the successor alone is living');
    const everything = await get(app, `/stores/atlas/memories?include_terminals`);
    assert.equal(everything.body.memories.length, 2, 'the superseded joins');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('get serves the projection — raw edges at the default depth, expansion on demand', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    const a = seed(atlas, 'a', { kind: 'note' });
    const b = seed(atlas, 'b', { kind: 'note' });
    const c = seed(atlas, 'c', { kind: 'note' });
    atlas.link(a, b, 'next');
    atlas.link(b, c, 'next');
    const raw = await get(app, `/stores/atlas/memories/${a}`);
    assert.equal(raw.status, 200);
    assert.equal(raw.body.relations.out.length, 1);
    assert.equal(raw.body.relations.out[0].to_id, b, 'the raw edge names the target');
    assert.equal(raw.body.relations.out[0].target, null, 'depth 1 serves raw edges');
    const one = await get(app, `/stores/atlas/memories/${a}?depth=2`);
    assert.equal(one.body.relations.out[0].target.content, 'b');
    assert.equal(
      one.body.relations.out[0].target.relations.out[0].target,
      null,
      'the budget stops after b',
    );
    const two = await get(app, `/stores/atlas/memories/${a}?depth=3`);
    assert.equal(two.body.relations.out[0].target.relations.out[0].target.content, 'c');
    assert.equal(
      (await get(app, `/stores/atlas/memories/${c}`)).status,
      200,
      'c has no out edges — still 200',
    );
    const unknown = await get(app, `/stores/atlas/memories/00000000-0000-4000-8000-000000000000`);
    assert.equal(unknown.status, 404);
    assert.match((unknown.body as { error: string }).error, /memory not found/);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('search serves bare hits with their rank — no cursor', async () => {
  const dir = tempDir();
  try {
    const { app, registry, atlas } = boot(dir);
    seed(atlas, 'the quick brown fox', { kind: 'note' });
    seed(atlas, 'something else entirely', { kind: 'note' });
    const { status, body } = await get(app, `/stores/atlas/search?q=fox`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(body), 'a bare array');
    assert.equal(body.length, 1);
    assert.equal(body[0].content, 'the quick brown fox');
    assert.equal(typeof body[0].rank, 'number');
    assert.equal(body[0].next_after, undefined, 'no cursor on search');
    assert.equal((await get(app, `/stores/atlas/search?q=`)).status, 400, 'empty q refuses');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a foreign grant refuses 403 before existence is spoken; the operator reaches everything', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    // 'other' exists: the atlas grant still refuses — reach, not existence.
    registry.create('other');
    const foreign = await get(app, `/stores/other/memories`);
    assert.equal(foreign.status, 403);
    assert.match((foreign.body as { error: string }).error, /reaches store "atlas" only/);
    // Foreign AND unknown: still 403 — the registry's contents are not the grant's business.
    const foreignUnknown = await get(app, `/stores/nowhere/memories`);
    assert.equal(foreignUnknown.status, 403);
    // The operator (loopback) reaches any store.
    const operator = await get(app, `/stores/other/memories`, {});
    assert.equal(operator.status, 200);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable peer refuses even before reach — fail-closed holds on data routes', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/stores/atlas/memories');
    assert.equal(res.status, 401);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
