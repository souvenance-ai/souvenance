import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { startServer } from './serve/serve.ts';

/**
 * The real-socket smoke (#20, Q6): the socket-less tests pin behavior,
 * this one pins the wiring — @hono/node-server actually listening, the
 * timeouts' server built, the port resolved from 0, the close prompt.
 */

test('the server listens on the wire and answers healthz — a management-only boot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-socket-test-'));
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer({
      port: 0,
      host: '127.0.0.1',
      storesDir: dir,
      tokens: [],
      management: [{ agent: 'ops', secret: `souv-${'a'.repeat(32)}` }],
      version: 'test',
    });
    assert.ok(server.port > 0, 'the ephemeral port resolved');
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    assert.equal(res.status, 200, 'the public door answers bare — shape and liveness (Q1)');
    assert.deepEqual((await res.json()) as { ok: boolean }, { ok: true });
    const guarded = await fetch(`http://127.0.0.1:${server.port}/stores`);
    assert.equal(guarded.status, 401, 'the guarded namespace wants credentials');
  } finally {
    await server?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a zero-credential bind refuses at boot on any host — the refusal is host-blind', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-socket-test-'));
  try {
    await assert.rejects(
      startServer({
        port: 0,
        host: '0.0.0.0',
        storesDir: dir,
        tokens: [],
        management: [],
        version: 'test',
      }),
      /refusing to start — zero credentials/,
    );
    await assert.rejects(
      startServer({
        port: 0,
        host: '127.0.0.1',
        storesDir: dir,
        tokens: [],
        management: [],
        version: 'test',
      }),
      /refusing to start — zero credentials/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('close releases the locks — the next boot claims the stores again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-socket-test-'));
  try {
    const credentials = {
      tokens: [],
      management: [{ agent: 'ops', secret: `souv-${'a'.repeat(32)}` }],
    };
    const first = await startServer({
      port: 0,
      host: '127.0.0.1',
      storesDir: dir,
      version: 'test',
      ...credentials,
    });
    await first.close();
    const second = await startServer({
      port: 0,
      host: '127.0.0.1',
      storesDir: dir,
      version: 'test',
      ...credentials,
    });
    assert.ok(second.port > 0);
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
