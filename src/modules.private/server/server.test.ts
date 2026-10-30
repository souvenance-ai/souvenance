import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { ManagementGrant } from '../config/config.ts';
import { StoreError } from '../store/store-error/store-error.ts';
import { createApp } from './server.ts';
import { Registry } from './registry/registry.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-server-test-'));
}

/** A management credential: the family the describe route and probes serve. */
const MANAGEMENT: readonly ManagementGrant[] = [
  { agent: 'valentin', secret: `souv-${'a'.repeat(32)}` },
];
const MANAGEMENT_BEARER = { authorization: `Bearer ${MANAGEMENT[0]!.secret}` };

function boot(dir: string) {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: [], management: [], version: 'test' });
  return { registry, app };
}

test('healthz answers ok — liveness only', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()) as { ok: boolean }, { ok: true });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the OpenAPI document serves at /doc, the UI at /docs', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const doc = await app.request('/doc');
    assert.equal(doc.status, 200);
    const docBody = (await doc.json()) as {
      openapi: string;
      info: { title: string; version: string };
    };
    assert.equal(docBody.openapi, '3.0.0');
    assert.equal(docBody.info.title, 'souvenance');
    assert.equal(docBody.info.version, 'test');
    const ui = await app.request('/docs');
    assert.equal(ui.status, 200);
    assert.match(ui.headers.get('content-type') ?? '', /text\/html/);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the discovery door: the root points, the alias serves, the miss teaches (#62)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const pointer = await app.request('/');
    assert.equal(pointer.status, 200);
    assert.deepEqual((await pointer.json()) as Record<string, string>, {
      name: 'souvenance',
      version: 'test',
      healthz: '/healthz',
      doc: '/doc',
      docs: '/docs',
    });
    const alias = await app.request('/openapi.json');
    assert.equal(alias.status, 200);
    const served = (await alias.json()) as { openapi: string; info: { title: string } };
    assert.equal(served.openapi, '3.0.0');
    assert.equal(served.info.title, 'souvenance');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown routes answer the JSON envelope — never a bare-text 404', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/nope');
    assert.equal(res.status, 404);
    assert.deepEqual((await res.json()) as { error: string }, {
      error: 'no such route — the API document serves at /doc, the API lives under /stores',
    });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown store under the guarded namespace is a 404 once authenticated', async () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    const app = createApp({ registry, tokens: [], management: MANAGEMENT, version: 'test' });
    // The management credential passes the gate, walks the rate limit,
    // and reaches the describe route — 404 in the envelope, teaching.
    const res = await app.request('/stores/nowhere', { headers: MANAGEMENT_BEARER });
    assert.equal(res.status, 404);
    assert.deepEqual((await res.json()) as { error: string }, {
      error: 'no store "nowhere" in the registry',
    });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a guarded request with no credentials refuses 401 — every store access carries a token', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/stores/nowhere');
    assert.equal(res.status, 401);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a StoreError thrown inside the guard maps by code into the envelope', async () => {
  const dir = tempDir();
  try {
    const { registry } = boot(dir);
    const app = createApp({ registry, tokens: [], management: MANAGEMENT });
    // A probe route at a depth no real route claims: the mapping is the
    // subject here, not the route.
    app.get('/stores/probe-deep/inner', () => {
      throw new StoreError('conflict', 'the memory fights its state');
    });
    const res = await app.request('/stores/probe-deep/inner', { headers: MANAGEMENT_BEARER });
    assert.equal(res.status, 409);
    assert.deepEqual((await res.json()) as { error: string }, {
      error: 'the memory fights its state',
    });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a non-StoreError is an internal error — the client never sees internals', async () => {
  const dir = tempDir();
  try {
    const { registry } = boot(dir);
    const app = createApp({ registry, tokens: [], management: MANAGEMENT });
    app.get('/stores/probe-deep/inner', () => {
      throw new Error('the sqlite file screams in stack-trace');
    });
    const res = await app.request('/stores/probe-deep/inner', { headers: MANAGEMENT_BEARER });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'internal error');
    assert.equal(body.error.includes('sqlite'), false);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('busy answers an opaque 503 — the engine message never crosses the wire', async () => {
  const dir = tempDir();
  try {
    const { registry } = boot(dir);
    const app = createApp({ registry, tokens: [], management: MANAGEMENT });
    app.get('/stores/probe-deep/inner', () => {
      throw new StoreError('busy', 'database is locked ( SQLITE_BUSY: raw engine text )');
    });
    const res = await app.request('/stores/probe-deep/inner', { headers: MANAGEMENT_BEARER });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'the store is busy — retry in a moment');
    assert.equal(body.error.includes('SQLITE_BUSY'), false);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a bad bearer under the guard refuses 401 before any route exists', async () => {
  const dir = tempDir();
  try {
    const { registry } = boot(dir);
    const app = createApp({
      registry,
      tokens: [{ agent: 'atlas', secret: `souv-${'b'.repeat(32)}`, store: 'atlas', mode: 'rw' }],
      management: [],
    });
    const res = await app.request('/stores/atlas/memories', {
      headers: { authorization: 'Bearer souv-00000000000000000000000000000000' },
    });
    assert.equal(res.status, 401);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
