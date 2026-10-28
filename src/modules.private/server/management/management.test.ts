import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { TokenGrant } from '../../config/config.ts';
import { createApp } from '../server.ts';
import { Registry } from '../registry/registry.ts';

const SECRET = `souv-${'d'.repeat(32)}`;
const MANAGE_SECRET = `souv-${'e'.repeat(32)}`;
const TOKENS: readonly TokenGrant[] = [
  { agent: 'atlas', secret: SECRET, store: 'atlas', mode: 'rw' },
  { agent: 'registry', secret: MANAGE_SECRET, store: 'atlas', mode: 'rw', manage: true },
];

const LOOPBACK = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-management-test-'));
}

function boot(dir: string) {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: TOKENS, version: 'test' });
  return { registry, app };
}

/** A request authorized by the manage-cap grant. */
function manage(
  path: string,
  method = 'GET',
  body?: unknown,
): { readonly path: string; readonly init: RequestInit } {
  return bearerRequest(MANAGE_SECRET, path, method, body);
}

/** A request authorized by the plain rw grant — no manage cap. */
function plain(
  path: string,
  method = 'GET',
  body?: unknown,
): { readonly path: string; readonly init: RequestInit } {
  return bearerRequest(SECRET, path, method, body);
}

/** One bearer-request shape; the grants differ only in their secret. */
function bearerRequest(
  secret: string,
  path: string,
  method: string,
  body?: unknown,
): { readonly path: string; readonly init: RequestInit } {
  return {
    path,
    init: {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  };
}

async function call(
  app: ReturnType<typeof createApp>,
  request: { readonly path: string; readonly init: RequestInit },
  env: unknown = LOOPBACK,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const res = await app.request(request.path, request.init, env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('the operator creates a store — 201 with the name, the file on disk', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const { status, body } = await call(app, {
      path: '/stores',
      init: {
        method: 'POST',
        body: JSON.stringify({ name: 'main' }),
        headers: { 'content-type': 'application/json' },
      },
    });
    assert.equal(status, 201);
    assert.deepEqual(body, { name: 'main' });
    assert.ok(existsSync(join(dir, 'main.db')), 'the store file exists');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a collision refuses 409, a grammar-broken name refuses 400 in the envelope', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const first = await call(app, {
      path: '/stores',
      init: {
        method: 'POST',
        body: JSON.stringify({ name: 'main' }),
        headers: { 'content-type': 'application/json' },
      },
    });
    assert.equal(first.status, 201);
    const collision = await call(app, {
      path: '/stores',
      init: {
        method: 'POST',
        body: JSON.stringify({ name: 'main' }),
        headers: { 'content-type': 'application/json' },
      },
    });
    assert.equal(collision.status, 409);
    assert.match((collision.body as { error: string }).error, /already exists/);
    const grammar = await call(app, {
      path: '/stores',
      init: {
        method: 'POST',
        body: JSON.stringify({ name: 'Main' }),
        headers: { 'content-type': 'application/json' },
      },
    });
    assert.equal(grammar.status, 400);
    assert.match((grammar.body as { error: string }).error, /invalid request/);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the list serves bare descriptors — name plus stats, never paths', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('main');
    const { status, body } = await call(app, manage('/stores'));
    assert.equal(status, 200);
    const list = body as { name: string; stats: { memories: number } }[];
    assert.ok(Array.isArray(list), 'a bare JSON array');
    assert.deepEqual(
      list.map((descriptor) => descriptor.name),
      ['main'],
    );
    assert.equal(list[0]?.stats.memories, 0);
    assert.deepEqual(Object.keys(list[0] ?? {}), ['name', 'stats'], 'no path ever leaks');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('describe serves {name, stats}; unknown is 404; grammar-bad is 400', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('main');
    const described = await call(app, manage('/stores/main'));
    assert.equal(described.status, 200);
    assert.equal((described.body as { name: string }).name, 'main');
    const unknown = await call(app, manage('/stores/nope'));
    assert.equal(unknown.status, 404);
    assert.match((unknown.body as { error: string }).error, /no store "nope"/);
    const grammar = await call(app, manage('/stores/Bad'));
    assert.equal(grammar.status, 400);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fork answers 201 with the forked name — composed when the body stays silent', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('main');
    // No body at all: the composition stands in (the document says the
    // body is optional — the behavior agrees).
    const bodyless = await call(app, manage('/stores/main/fork', 'POST'));
    assert.equal(bodyless.status, 201);
    assert.deepEqual(bodyless.body, { name: 'main-fork' });
    const composed = await call(app, manage('/stores/main/fork', 'POST', {}));
    assert.equal(composed.status, 201);
    assert.deepEqual(composed.body, { name: 'main-fork-2' }, 'the second composed hop');
    const explicit = await call(app, manage('/stores/main/fork', 'POST', { name: 'copy' }));
    assert.equal(explicit.status, 201);
    assert.deepEqual(explicit.body, { name: 'copy' });
    const nowhere = await call(app, manage('/stores/nowhere/fork', 'POST', {}));
    assert.equal(nowhere.status, 404);
    const collision = await call(app, manage('/stores/main/fork', 'POST', { name: 'copy' }));
    assert.equal(collision.status, 409);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('delete answers 204 and removes the trio; the second delete is a 404', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('main');
    const gone = await call(app, manage('/stores/main', 'DELETE'));
    assert.equal(gone.status, 204);
    assert.equal(gone.body, null, '204, no body');
    assert.ok(!existsSync(join(dir, 'main.db')));
    assert.ok(!existsSync(join(dir, 'main.db-wal')), 'the WAL sidecar goes with it');
    assert.ok(!existsSync(join(dir, 'main.db-shm')), 'the shm sidecar goes with it');
    assert.ok(!existsSync(join(dir, 'main.lock')));
    const again = await call(app, manage('/stores/main', 'DELETE'));
    assert.equal(again.status, 404);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the stats ride the facade verbatim — the document speaks the same shape', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const main = registry.create('main');
    main.store('a real memory', { kind: 'note' });
    const described = await call(app, manage('/stores/main'));
    assert.equal(described.status, 200);
    assert.deepEqual((described.body as { stats: Record<string, unknown> }).stats, {
      memories: 1,
      memories_by_status: { active: 1 },
      memories_by_kind: { note: 1 },
      edges: 0,
      edges_by_kind: {},
    });
    // The OpenAPI document — generated from the same schema set — names
    // the facade's fields; the schema and the facade cannot drift apart
    // without this pin noticing the wire.
    const doc = await call(app, manage('/doc'));
    assert.ok(
      JSON.stringify(doc.body).includes('memories_by_status'),
      'the document describes the stats shape',
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a grant without the manage cap refuses 403 on every management route', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('main');
    const attempts = [
      plain('/stores', 'POST', { name: 'other' }),
      plain('/stores'),
      plain('/stores/main'),
      plain('/stores/main/fork', 'POST', {}),
      plain('/stores/main', 'DELETE'),
    ];
    for (const request of attempts) {
      const { status, body } = await call(app, request, {});
      assert.equal(
        status,
        403,
        `${request.init.method ?? 'GET'} ${request.path} must refuse without the cap`,
      );
      assert.match((body as { error: string }).error, /manage cap/);
    }
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a grant carrying the manage cap drives the routes like the operator', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const created = await call(app, manage('/stores', 'POST', { name: 'by-grant' }));
    assert.equal(created.status, 201);
    const list = await call(app, manage('/stores'));
    const names = (list.body as { name: string }[]).map((descriptor) => descriptor.name);
    assert.deepEqual(names, ['by-grant']);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
