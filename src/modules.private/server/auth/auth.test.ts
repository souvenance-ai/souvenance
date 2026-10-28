import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { test } from 'vitest';
import type { TokenGrant } from '../../config/config.ts';
import {
  auth,
  bearerOf,
  isLoopback,
  isLoopbackHost,
  OPERATOR_STORE,
  type ServerEnv,
} from './auth.ts';

const SECRET = `souv-${'b'.repeat(32)}`;
const TOKENS: readonly TokenGrant[] = [
  { agent: 'atlas', secret: SECRET, store: 'atlas', mode: 'rw' },
];

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

test('no header resolves to the operator — the synthetic peer counts as loopback', async () => {
  const res = await harness([]).request('/probe');
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

test('a matching bearer resolves to its grant — one agent, one store', async () => {
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

test('a malformed scheme is treated as no header — operator on loopback', async () => {
  const res = await harness([]).request('/probe', {
    headers: { authorization: `Basic ${SECRET}` },
  });
  assert.equal(res.status, 200);
  const grant = (await res.json()) as { agent: string };
  assert.equal(grant.agent, 'operator');
});
