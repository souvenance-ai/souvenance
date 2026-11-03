/**
 * The opt-in request log's own tests (#69): the line shape pinned in the
 * ticket's field order, the refusals logged like the 200s (401, 429, the
 * teaching 404, the thrown refusals — their eventual status, not the
 * opaque 500), the arrival order pinned, the redaction invariant (no
 * `souv-` secret anywhere in the file), and the off state (no file, no
 * line). The boot ceremony's side (the append opening + the banner) is
 * pinned by the boot's tests.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { Registry } from '../registry/registry.ts';
import type { ServerEnv } from '../auth/auth.ts';
import { createApp } from '../server.ts';
import { requestLog } from './request-log.ts';

/** The line's one shape — the ticket's field order, pinned key by key. */
interface LogLine {
  readonly ts: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly ms: number;
  readonly agent: string | null;
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-request-log-test-'));
}

function lines(path: string): readonly LogLine[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as LogLine);
}

/**
 * A registry with one store and one rw grant for it — the log's test
 * boot. The store is created so a granted read serves 200.
 */
function boot(dir: string, logPath?: string) {
  const registry = Registry.open(dir);
  const store = registry.create('mneme');
  const app = createApp({
    registry,
    tokens: [{ agent: 'nova', secret: `souv-${'b'.repeat(32)}`, store: 'mneme', mode: 'rw' }],
    management: [],
    version: 'test',
    logRequests: logPath,
  });
  return { registry, app, store };
}

const NOVA = { authorization: `Bearer souv-${'b'.repeat(32)}` };

test("one JSONL line per request, the ticket's shape and field order", async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir, logPath);
    const res = await app.request('/memories', { headers: NOVA });
    assert.equal(res.status, 200);
    registry.close();
    const [line] = lines(logPath);
    assert.deepEqual(Object.keys(line), ['ts', 'method', 'path', 'status', 'ms', 'agent']);
    assert.equal(line.method, 'GET');
    assert.equal(line.path, '/memories');
    assert.equal(line.status, 200);
    assert.ok(line.ms >= 0, 'the duration is a non-negative whole ms');
    assert.equal(line.agent, 'nova');
    assert.match(line.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the query string rides the path — the capture arbitrates the filters', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir, logPath);
    await app.request('/healthz');
    const [first] = lines(logPath);
    assert.equal(first.path, '/healthz');
    await app.request('/memories?kind=note&include_terminals', { headers: NOVA });
    const [, second] = lines(logPath);
    assert.equal(second.path, '/memories?kind=note&include_terminals');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a refused credential is logged like a 200 — agent null, never the bearer', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir, logPath);
    const res = await app.request('/memories', {
      headers: { authorization: `Bearer souv-${'c'.repeat(32)}` },
    });
    assert.equal(res.status, 401);
    registry.close();
    const [line] = lines(logPath);
    assert.equal(line.status, 401);
    assert.equal(line.agent, null);
    // The redaction invariant: the presented secret is nowhere in the file.
    assert.ok(!readFileSync(logPath, 'utf8').includes(`souv-${'c'.repeat(32)}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the teaching 404 is logged — a mute door still writes its line', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir, logPath);
    const res = await app.request('/nowhere');
    assert.equal(res.status, 404);
    registry.close();
    const [line] = lines(logPath);
    assert.equal(line.status, 404);
    assert.equal(line.agent, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a thrown reach refusal is logged with its eventual status, not the opaque 500', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const registry = Registry.open(dir);
    registry.create('mneme');
    const app = createApp({
      registry,
      tokens: [],
      management: [{ agent: 'ops', secret: `souv-${'a'.repeat(32)}` }],
      version: 'test',
      logRequests: logPath,
    });
    // A management grant on the data surface: the family gate throws the
    // HTTPException whose 403 the envelope will serve (#74 — the only 403
    // left on the data surface is the family gate; the foreign family
    // retired with the path).
    const res = await app.request('/memories', {
      headers: { authorization: `Bearer souv-${'a'.repeat(32)}` },
    });
    assert.equal(res.status, 403);
    registry.close();
    const [line] = lines(logPath);
    assert.equal(line.status, 403);
    assert.equal(line.agent, 'ops');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a thrown StoreError refusal is logged with its mapped status too', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir, logPath);
    // A reached store, a memory id it never held: the facade's
    // not_found throws, the envelope serves its mapped 404 — the line
    // must carry that 404, never the opaque 500.
    const absent = '00000000-0000-0000-0000-000000000000';
    const res = await app.request(`/memories/${absent}`, { headers: NOVA });
    assert.equal(res.status, 404);
    registry.close();
    const [line] = lines(logPath);
    assert.equal(line.status, 404);
    assert.equal(line.agent, 'nova');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a refusal settled by an inner middleware is logged like the 200s (429)', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const app = new OpenAPIHono<ServerEnv>();
    app.use('*', requestLog({ path: logPath }));
    app.use('*', async (c) =>
      c.json({ error: 'rate limit exceeded — 120 requests per 60s window' }, 429),
    );
    const res = await app.request('/memories');
    assert.equal(res.status, 429);
    const [line] = lines(logPath);
    assert.equal(line.status, 429);
    assert.equal(line.agent, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two requests write two lines in arrival order', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir, logPath);
    await app.request('/healthz');
    await app.request('/healthz');
    registry.close();
    const [first, second] = lines(logPath);
    assert.ok(first.ts <= second.ts, 'the timestamps never go backwards');
    assert.equal(first.path, '/healthz');
    assert.equal(second.path, '/healthz');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the redaction invariant — no secret anywhere in the file', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir, logPath);
    await app.request('/memories', { headers: NOVA });
    await app.request('/memories');
    registry.close();
    const raw = readFileSync(logPath, 'utf8');
    assert.equal(lines(logPath).length, 2, 'both requests wrote their line');
    assert.ok(!raw.includes(`souv-${'b'.repeat(32)}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a non-Error throw sails past Hono\u2019s funnel — the in-flight line carries the 500', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const app = new OpenAPIHono<ServerEnv>();
    app.use('*', requestLog({ path: logPath }));
    app.use('*', async () => {
      throw 'not an error'; // Hono funnels only Error instances — this sails to the log's catch
    });
    await assert.rejects(async () => app.request('/boom'));
    const [line] = lines(logPath);
    assert.equal(line.status, 500);
    assert.equal(line.agent, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a grant resolved before the throw rides the in-flight line — null only when none', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const app = new OpenAPIHono<ServerEnv>();
    app.use('*', requestLog({ path: logPath }));
    app.use('*', async (c) => {
      c.set('grant', { family: 'store', agent: 'nova', store: 'mneme', mode: 'rw', key: 'k' });
      throw 'not an error';
    });
    await assert.rejects(async () => app.request('/memories'));
    const [line] = lines(logPath);
    assert.equal(line.status, 500);
    assert.equal(line.agent, 'nova');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the management family\u2019s label rides the line — both families speak (#69)', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const registry = Registry.open(dir);
    const app = createApp({
      registry,
      tokens: [],
      management: [{ agent: 'ops', secret: `souv-${'a'.repeat(32)}` }],
      version: 'test',
      logRequests: logPath,
    });
    const res = await app.request('/stores', {
      headers: { authorization: `Bearer souv-${'a'.repeat(32)}` },
    });
    assert.equal(res.status, 200);
    registry.close();
    const [line] = lines(logPath);
    assert.equal(line.agent, 'ops');
    assert.equal(line.status, 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed log write never breaks the response — stderr, wire intact (#69)', async () => {
  const dir = tempDir();
  const brokenPath = join(dir, 'a-directory'); // appending to a directory throws
  mkdirSync(brokenPath);
  try {
    const app = new OpenAPIHono<ServerEnv>();
    app.use('*', requestLog({ path: brokenPath }));
    app.get('/healthz', (c) => c.json({ ok: true }));
    const res = await app.request('/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()) as { ok: boolean }, { ok: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('off = no file, no line, byte-identical responses', async () => {
  const dir = tempDir();
  const logPath = join(dir, 'requests.jsonl');
  try {
    const { app, registry } = boot(dir);
    const res = await app.request('/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()) as { ok: boolean }, { ok: true });
    registry.close();
    assert.ok(!existsSync(logPath), 'the off state creates nothing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
