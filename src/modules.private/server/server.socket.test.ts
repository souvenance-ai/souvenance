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

test('the server listens on the wire and answers healthz', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-socket-test-'));
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer({
      port: 0,
      host: '127.0.0.1',
      storesDir: dir,
      tokens: [],
      version: 'test',
    });
    assert.ok(server.port > 0, 'the ephemeral port resolved');
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()) as { ok: boolean }, { ok: true });
  } finally {
    await server?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a non-loopback bind without tokens refuses at boot — before anything opens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-socket-test-'));
  try {
    await assert.rejects(
      startServer({ port: 0, host: '0.0.0.0', storesDir: dir, tokens: [], version: 'test' }),
      /refusing to bind/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('close releases the locks — the next boot claims the stores again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-socket-test-'));
  try {
    const first = await startServer({
      port: 0,
      host: '127.0.0.1',
      storesDir: dir,
      tokens: [],
      version: 'test',
    });
    await first.close();
    const second = await startServer({
      port: 0,
      host: '127.0.0.1',
      storesDir: dir,
      tokens: [],
      version: 'test',
    });
    assert.ok(second.port > 0);
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
