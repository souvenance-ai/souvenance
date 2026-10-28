import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { StoreError } from '../store/store-error/store-error.ts';
import { createApp } from './server.ts';
import { Registry } from './registry/registry.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-server-test-'));
}

/** The env a real loopback connection carries (the node adapter's shape). */
function loopbackEnv(): { incoming: { socket: { remoteAddress: string } } } {
  return { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
}

function boot(dir: string) {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: [], version: 'test' });
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

test('unknown routes answer the JSON envelope — never a bare-text 404', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/nope');
    assert.equal(res.status, 404);
    assert.deepEqual((await res.json()) as { error: string }, { error: 'no such route' });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown store under the guarded namespace is a 404 once authenticated', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    // The loopback peer passes auth, walks the rate limit and the cap,
    // and reaches the describe route — 404 in the envelope, teaching.
    const res = await app.request('/stores/nowhere', {}, loopbackEnv());
    assert.equal(res.status, 404);
    assert.deepEqual((await res.json()) as { error: string }, {
      error: 'no store "nowhere" in the registry',
    });
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a guarded request with no peer seen refuses 401 — the check fails closed', async () => {
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
    const app = createApp({ registry, tokens: [] });
    // A probe route at a depth no real route claims: the mapping is the
    // subject here, not the route.
    app.get('/stores/probe-deep/inner', () => {
      throw new StoreError('conflict', 'the memory fights its state');
    });
    const res = await app.request('/stores/probe-deep/inner', {}, loopbackEnv());
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
    const app = createApp({ registry, tokens: [] });
    app.get('/stores/probe-deep/inner', () => {
      throw new Error('the sqlite file screams in stack-trace');
    });
    const res = await app.request('/stores/probe-deep/inner', {}, loopbackEnv());
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'internal error');
    assert.equal(body.error.includes('sqlite'), false);
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
