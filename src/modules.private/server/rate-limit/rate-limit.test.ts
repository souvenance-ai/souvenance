import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { test } from 'vitest';
import type { ResolvedGrant } from '../auth/auth.ts';
import { rateLimit } from './rate-limit.ts';

function grant(overrides: Partial<ResolvedGrant> = {}): ResolvedGrant {
  return {
    agent: 'atlas',
    store: 'atlas',
    mode: 'rw',
    manage: false,
    operator: false,
    key: 'atlas-key',
    ...overrides,
  };
}

/** A harness that plants a grant then runs the limiter on one route. */
function harness(grantValue: ResolvedGrant, options: Parameters<typeof rateLimit>[0]) {
  const app = new Hono<{ Variables: { grant: ResolvedGrant } }>();
  app.use('*', (c, next) => {
    c.set('grant', grantValue);
    return next();
  });
  app.use('*', rateLimit(options));
  app.get('/probe', (c) => c.json({ ok: true }));
  return app;
}

test('the operator is exempt — the limit guards distant agents, not the local hand', async () => {
  const app = harness(grant({ operator: true }), { limit: 1 });
  for (let i = 0; i < 5; i++) {
    const res = await app.request('/probe');
    assert.equal(res.status, 200);
  }
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
