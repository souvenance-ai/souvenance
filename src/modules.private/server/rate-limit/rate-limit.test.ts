import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { test } from 'vitest';
import type {
  ManagementGrantResolved,
  ResolvedGrant,
  ServerEnv,
  StoreGrantResolved,
} from '../auth/auth.ts';
import { rateLimit } from './rate-limit.ts';

function grant(overrides: Partial<StoreGrantResolved> = {}): ResolvedGrant {
  return {
    family: 'store',
    agent: 'atlas',
    store: 'atlas',
    mode: 'rw',
    key: 'atlas-key',
    ...overrides,
  };
}

function managementGrant(overrides: Partial<ManagementGrantResolved> = {}): ResolvedGrant {
  return { family: 'management', agent: 'ops', key: 'ops-key', ...overrides };
}

/** A harness that plants a grant then runs the limiter on one route. */
function harness(grantValue: ResolvedGrant, options: Parameters<typeof rateLimit>[0]) {
  const app = new Hono<ServerEnv>();
  app.use('*', (c, next) => {
    c.set('grant', grantValue);
    return next();
  });
  app.use('*', rateLimit(options));
  app.get('/probe', (c) => c.json({ ok: true }));
  return app;
}

test('a management credential eats the limit like a store grant — no family is exempt', async () => {
  const app = harness(managementGrant(), { limit: 1 });
  assert.equal((await app.request('/probe')).status, 200);
  assert.equal((await app.request('/probe')).status, 429);
});

test('the Nth+1 request inside the window refuses 429 with Retry-After', async () => {
  let now = 0;
  const app = harness(grant(), { limit: 3, windowMs: 1_000, now: () => now });
  assert.equal((await app.request('/probe')).status, 200);
  assert.equal((await app.request('/probe')).status, 200);
  assert.equal((await app.request('/probe')).status, 200);
  const refused = await app.request('/probe');
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get('retry-after')) >= 1);
  const body = (await refused.json()) as { error: string };
  assert.match(body.error, /rate limit exceeded/);
});

test('a new window resets the count', async () => {
  let now = 0;
  const app = harness(grant(), { limit: 1, windowMs: 1_000, now: () => now });
  assert.equal((await app.request('/probe')).status, 200);
  assert.equal((await app.request('/probe')).status, 429);
  now = 1_000;
  assert.equal((await app.request('/probe')).status, 200);
});

test('distinct grant keys never share a bucket', async () => {
  let now = 0;
  const app = new Hono<{ Variables: { grant: ResolvedGrant } }>();
  let current = grant({ key: 'a' });
  app.use('*', (c, next) => {
    c.set('grant', current);
    return next();
  });
  app.use('*', rateLimit({ limit: 1, windowMs: 1_000, now: () => now }));
  app.get('/probe', (c) => c.json({ ok: true }));
  assert.equal((await app.request('/probe')).status, 200);
  assert.equal((await app.request('/probe')).status, 429);
  current = grant({ key: 'b' });
  assert.equal((await app.request('/probe')).status, 200);
});

test('a management key never shares a bucket with a store grant', async () => {
  let now = 0;
  const app = new Hono<{ Variables: { grant: ResolvedGrant } }>();
  let current: ResolvedGrant = grant({ key: 'store-key' });
  app.use('*', (c, next) => {
    c.set('grant', current);
    return next();
  });
  app.use('*', rateLimit({ limit: 1, windowMs: 1_000, now: () => now }));
  app.get('/probe', (c) => c.json({ ok: true }));
  assert.equal((await app.request('/probe')).status, 200);
  current = managementGrant({ key: 'management-key' });
  assert.equal(
    (await app.request('/probe')).status,
    200,
    'the families bucket separately — the digest keys, never the family',
  );
});
