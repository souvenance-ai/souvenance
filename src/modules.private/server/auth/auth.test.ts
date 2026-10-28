import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { test } from 'vitest';
import type { TokenGrant } from '../../config/config.ts';
import {
  auth,
  bearerOf,
  grantReaches,
  isLoopback,
  isLoopbackHost,
  OPERATOR_STORE,
  type ServerEnv,
} from './auth.ts';

const SECRET = `souv-${'b'.repeat(32)}`;
const TOKENS: readonly TokenGrant[] = [
  { agent: 'atlas', secret: SECRET, store: 'atlas', mode: 'rw' },
];

/** The env a real loopback connection carries (the node adapter's shape). */
function loopbackEnv(): { incoming: { socket: { remoteAddress: string } } } {
  return { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
}

/** A one-route harness: the handler answers with the resolved grant. */
function harness(tokens: readonly TokenGrant[]): Hono<ServerEnv> {
  const app = new Hono<ServerEnv>();
  app.use('*', auth(tokens));
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

test('the loopback notion covers the v4, v6 and mapped forms — never the wildcard', () => {
  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('::1'), true);
  assert.equal(isLoopback('::ffff:127.0.0.1'), true);
  assert.equal(isLoopback('192.168.1.10'), false);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false, 'binding every interface is not local');
});

test('grantReaches: the operator reaches every store, a grant its one', () => {
  const operator = {
    agent: 'operator',
    store: OPERATOR_STORE,
    mode: 'rw',
    manage: true,
    operator: true,
    key: 'operator',
  } as const;
  const atlasGrant = {
    agent: 'atlas',
    store: 'atlas',
    mode: 'rw',
    manage: false,
    operator: false,
    key: 'k',
  } as const;
  assert.equal(grantReaches(operator, 'atlas'), true);
  assert.equal(grantReaches(operator, 'nowhere'), true);
  assert.equal(grantReaches(atlasGrant, 'atlas'), true);
  assert.equal(grantReaches(atlasGrant, 'other'), false);
});

test('no header on a seen loopback peer resolves to the operator', async () => {
  const res = await harness([]).request('/probe', {}, loopbackEnv());
  assert.equal(res.status, 200);
  const grant = (await res.json()) as {
    agent: string;
    store: string;
    manage: boolean;
    operator: boolean;
  };
  assert.equal(grant.agent, 'operator');
  assert.equal(grant.store, OPERATOR_STORE);
  assert.equal(grant.manage, true);
  assert.equal(grant.operator, true);
});

test('no header with NO peer seen refuses — the check fails closed', async () => {
  const res = await harness([]).request('/probe');
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /no loopback peer seen/);
});

test('no header on a remote peer refuses 401 — tokens only off loopback', async () => {
  const res = await harness([]).request(
    '/probe',
    {},
    { incoming: { socket: { remoteAddress: '192.168.1.10' } } },
  );
  assert.equal(res.status, 401);
});

test('a matching bearer resolves to its grant — one agent, one store, no peer needed', async () => {
  const res = await harness(TOKENS).request('/probe', {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  assert.equal(res.status, 200);
  const grant = (await res.json()) as {
    agent: string;
    store: string;
    mode: string;
    manage: boolean;
  };
  assert.equal(grant.agent, 'atlas');
  assert.equal(grant.store, 'atlas');
  assert.equal(grant.mode, 'rw');
  assert.equal(grant.manage, false, 'manage is deny by default');
});

test('a bearer matching no row refuses 401', async () => {
  const res = await harness(TOKENS).request('/probe', {
    headers: { authorization: `Bearer souv-${'c'.repeat(32)}` },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /unknown grant/);
});

test('a presented non-Bearer credential refuses 401 — never a downgrade to operator', async () => {
  const res = await harness([]).request(
    '/probe',
    { headers: { authorization: `Basic ${SECRET}` } },
    loopbackEnv(),
  );
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /only Bearer credentials/);
});
