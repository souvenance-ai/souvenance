import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { test } from 'vitest';
import type { CredentialFamilies, ManagementGrant, StoreGrant } from '../../config/config.ts';
import { auth, bearerOf, requireManagement, type ServerEnv } from './auth.ts';

const SECRET = `souv-${'b'.repeat(32)}`;
const TOKENS: readonly StoreGrant[] = [
  { agent: 'atlas', secret: SECRET, store: 'atlas', mode: 'rw' },
];
const MANAGEMENT_SECRET = `souv-${'a'.repeat(32)}`;
const MANAGEMENT: readonly ManagementGrant[] = [{ agent: 'valentin', secret: MANAGEMENT_SECRET }];

/** A one-route harness: the handler answers with the resolved grant. */
function harness(credentials: CredentialFamilies): Hono<ServerEnv> {
  const app = new Hono<ServerEnv>();
  app.use('*', auth(credentials));
  app.get('/probe', (c) => c.json(c.get('grant')));
  return app;
}

test('bearerOf reads the scheme case-insensitively and refuses the rest', () => {
  assert.equal(bearerOf('Bearer souv-abc'), 'souv-abc');
  assert.equal(bearerOf('bearer souv-abc'), 'souv-abc');
  assert.equal(bearerOf('Basic souv-abc'), undefined);
  assert.equal(bearerOf('Bearer'), undefined);
  assert.equal(bearerOf(undefined), undefined);
});

test('no header refuses 401 whatever the peer — the loopback bypass retired (#63)', async () => {
  const app = harness({ tokens: TOKENS, management: [] });
  const unseen = await app.request('/probe');
  assert.equal(unseen.status, 401);
  assert.match(
    ((await unseen.json()) as { error: string }).error,
    /every store access carries a token/,
  );
  const loopback = await app.request(
    '/probe',
    {},
    { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
  );
  assert.equal(loopback.status, 401);
  const remote = await app.request(
    '/probe',
    {},
    { incoming: { socket: { remoteAddress: '192.168.1.10' } } },
  );
  assert.equal(remote.status, 401);
});

test('a matching bearer resolves to its store grant — one agent, one store', async () => {
  const res = await harness({ tokens: TOKENS, management: [] }).request('/probe', {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  assert.equal(res.status, 200);
  const grant = (await res.json()) as {
    family: string;
    agent: string;
    store: string;
    mode: string;
  };
  assert.equal(grant.family, 'store');
  assert.equal(grant.agent, 'atlas');
  assert.equal(grant.store, 'atlas');
  assert.equal(grant.mode, 'rw');
});

test('a management bearer resolves to the management family — no store, no mode', async () => {
  const res = await harness({ tokens: [], management: MANAGEMENT }).request('/probe', {
    headers: { authorization: `Bearer ${MANAGEMENT_SECRET}` },
  });
  assert.equal(res.status, 200);
  const grant = (await res.json()) as { family: string; agent: string; store?: string };
  assert.equal(grant.family, 'management');
  assert.equal(grant.agent, 'valentin');
  assert.equal(grant.store, undefined);
});

test('a bearer matching no row in either family refuses 401', async () => {
  const res = await harness({ tokens: TOKENS, management: MANAGEMENT }).request('/probe', {
    headers: { authorization: `Bearer souv-${'c'.repeat(32)}` },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /unknown grant/);
});

test('a presented non-Bearer credential refuses 401', async () => {
  const res = await harness({ tokens: [], management: [] }).request('/probe', {
    headers: { authorization: `Basic ${SECRET}` },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /only Bearer credentials/);
});

test('the management gate: a management grant passes, a store grant refuses 403', async () => {
  const app = new Hono<ServerEnv>();
  app.use('*', auth({ tokens: TOKENS, management: MANAGEMENT }));
  app.use('*', requireManagement());
  app.get('/probe', (c) => c.json(c.get('grant')));
  const ok = await app.request('/probe', {
    headers: { authorization: `Bearer ${MANAGEMENT_SECRET}` },
  });
  assert.equal(ok.status, 200);
  const refused = await app.request('/probe', {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  assert.equal(refused.status, 403);
  const body = (await refused.json()) as { error: string };
  assert.match(body.error, /a store grant reaches no management route/);
});
