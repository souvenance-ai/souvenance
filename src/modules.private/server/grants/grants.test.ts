import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { Hono } from 'hono';
import type { CredentialFamilies, ManagementGrant, StoreGrant } from '../../config/config.ts';
import { loadConfig, SOUV_SECRET } from '../../config/config.ts';
import type { ServerEnv } from '../auth/auth.ts';
import { createApp } from '../server.ts';
import { Registry } from '../registry/registry.ts';

const MANAGEMENT_SECRET = `souv-${'a'.repeat(32)}`;
const MANAGEMENT: readonly ManagementGrant[] = [{ agent: 'valentin', secret: MANAGEMENT_SECRET }];
const MANAGEMENT_BEARER = { authorization: `Bearer ${MANAGEMENT_SECRET}` };
const STORE_SECRET = `souv-${'b'.repeat(32)}`;
const STORE_ROWS: readonly StoreGrant[] = [
  { agent: 'atlas', secret: STORE_SECRET, store: 'euria', mode: 'rw' },
];

const dirs: string[] = [];

interface Workspace {
  readonly storesDir: string;
  readonly configPath: string;
}

/** One temp workspace: the stores dir is the truth, the config file rides beside it. */
function workspace(config: unknown): Workspace {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-grants-test-'));
  dirs.push(dir);
  const storesDir = join(dir, 'stores');
  const configPath = join(dir, 'config.json');
  if (config !== undefined) writeFileSync(configPath, JSON.stringify(config, null, 2));
  return { storesDir, configPath };
}

/** Boots the app on the workspace, the given families in hand. */
function boot(
  space: Workspace,
  families: CredentialFamilies,
): { app: Hono<ServerEnv>; registry: Registry } {
  const registry = Registry.open(space.storesDir);
  const app = createApp({
    registry,
    tokens: families.tokens,
    management: families.management,
    configPath: space.configPath,
    version: 'test',
  });
  return { app, registry };
}

function fileRows(space: Workspace): unknown[] {
  const doc = JSON.parse(readFileSync(space.configPath, 'utf8')) as Record<string, unknown>;
  assert.ok(Array.isArray(doc['tokens']));
  return doc['tokens'] as unknown[];
}

test.afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('the grant routes answer the families: bare 401, store grant 403, unknown store 404', async () => {
  const space = workspace({ tokens: STORE_ROWS, management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: STORE_ROWS, management: MANAGEMENT });
  try {
    registry.create('euria');
    const storeGrant = { authorization: `Bearer ${STORE_SECRET}` };
    // Bare: every route wants a token.
    const bare = await app.request('/stores/euria/grants');
    assert.equal(bare.status, 401);
    const bareMint = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'scribe', mode: 'ro' }),
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(bareMint.status, 401);
    // The store family reaches no management route, whatever the mode.
    const family = await app.request('/stores/euria/grants', { headers: storeGrant });
    assert.equal(family.status, 403);
    const familyMint = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'scribe', mode: 'ro' }),
      headers: storeGrant,
    });
    assert.equal(familyMint.status, 403);
    const familyRevoke = await app.request('/stores/euria/grants/atlas', {
      method: 'DELETE',
      headers: storeGrant,
    });
    assert.equal(familyRevoke.status, 403);
    // Unknown stores refuse all three, before any credential work.
    const missMint = await app.request('/stores/ghost/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'scribe', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(missMint.status, 404);
    assert.match(((await missMint.json()) as { error: string }).error, /no store "ghost"/);
    const missList = await app.request('/stores/ghost/grants', { headers: MANAGEMENT_BEARER });
    assert.equal(missList.status, 404);
    const missRevoke = await app.request('/stores/ghost/grants/atlas', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(missRevoke.status, 404);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('the mint serves the row with its secret exactly once, authors the file at 0600', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    const res = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(res.status, 201);
    const minted = (await res.json()) as {
      agent: string;
      store: string;
      mode: string;
      secret: string;
    };
    assert.deepEqual(
      { agent: minted.agent, store: minted.store, mode: minted.mode },
      { agent: 'atlas', store: 'euria', mode: 'ro' },
    );
    assert.ok(SOUV_SECRET.test(minted.secret));
    // The file echoes the row — and the write tightened it to 0600.
    const doc = JSON.parse(readFileSync(space.configPath, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(doc['tokens'], [
      { agent: 'atlas', secret: minted.secret, store: 'euria', mode: 'ro' },
    ]);
    assert.equal(statSync(space.configPath).mode & 0o777, 0o600);
    // The list serves the row, never the secret.
    const list = await app.request('/stores/euria/grants', { headers: MANAGEMENT_BEARER });
    assert.equal(list.status, 200);
    const text = await list.text();
    assert.ok(!text.includes(minted.secret), 'the list never serves the secret');
    assert.deepEqual(JSON.parse(text), [{ agent: 'atlas', store: 'euria', mode: 'ro' }]);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('the dream ceremony: fork, then mint (ro), then consume — zero host-side gesture', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    const fork = await app.request('/stores/euria/fork', {
      method: 'POST',
      headers: { ...MANAGEMENT_BEARER }, // no body: the composed name is the wire's
    });
    assert.equal(fork.status, 201);
    const { name: forked } = (await fork.json()) as { name: string };
    const mint = await app.request(`/stores/${forked}/grants`, {
      method: 'POST',
      body: JSON.stringify({ agent: 'continuation', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(mint.status, 201);
    const { secret } = (await mint.json()) as { secret: string };
    // The minted grant is already real: the data routes serve it now.
    const list = await app.request('/memories', {
      headers: { authorization: `Bearer ${secret}` },
    });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { memories: [], next_after: null });
    // The mode rode along: a ro grant refuses the write.
    const write = await app.request('/memories', {
      method: 'POST',
      body: JSON.stringify({ content: 'born', kind: 'note' }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    });
    assert.equal(write.status, 403);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('a duplicate (agent, store) mint refuses 409 with the rotation remedy, the file untouched', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    const before = readFileSync(space.configPath, 'utf8');
    const res = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'rw' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(res.status, 409);
    assert.match(((await res.json()) as { error: string }).error, /revoking, then minting again/);
    assert.equal(readFileSync(space.configPath, 'utf8'), before);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('the revoke is immediate on both sources of truth, and the freed pair mints again', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    const mint = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    const { secret } = (await mint.json()) as { secret: string };
    const spoke = await app.request('/memories', {
      headers: { authorization: `Bearer ${secret}` },
    });
    assert.equal(spoke.status, 200);
    const revoke = await app.request('/stores/euria/grants/atlas', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(revoke.status, 204);
    // Immediate: the next request with the revoked secret refuses.
    const denied = await app.request('/memories', {
      headers: { authorization: `Bearer ${secret}` },
    });
    assert.equal(denied.status, 401);
    assert.deepEqual(fileRows(space), []);
    // Rotation is revoke, then mint: the freed pair re-mints, a fresh secret.
    const rotation = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'rw' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(rotation.status, 201);
    const fresh = (await rotation.json()) as { secret: string };
    assert.notEqual(fresh.secret, secret);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('revoking removes only the (agent, store) pair — a multi-grant agent keeps its other row', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    registry.create('euria-fork');
    for (const store of ['euria', 'euria-fork']) {
      await app.request(`/stores/${store}/grants`, {
        method: 'POST',
        body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
        headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
      });
    }
    assert.equal(fileRows(space).length, 2);
    const revoke = await app.request('/stores/euria/grants/atlas', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(revoke.status, 204);
    const exhausted = await app.request('/stores/euria/grants/atlas', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(exhausted.status, 404, 'the second revoke of the pair is a miss');
    assert.match(((await exhausted.json()) as { error: string }).error, /no grant for "atlas"/);
    // The other store's row survived the pair's revocation.
    const list = await app.request('/stores/euria-fork/grants', { headers: MANAGEMENT_BEARER });
    assert.deepEqual(await list.json(), [{ agent: 'atlas', store: 'euria-fork', mode: 'ro' }]);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('the wire judges the grammar: the mode, the agent, an unknown body key, the store name', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    const badMode = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'admin' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(badMode.status, 400);
    const unknownKey = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro', manage: true }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(unknownKey.status, 400);
    assert.match(
      ((await unknownKey.json()) as { error: string }).error,
      /manage/,
      'the refused key is named (#60)',
    );
    const emptyAgent = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: '', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(emptyAgent.status, 400);
    const badStore = await app.request('/stores/EURIA/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(badStore.status, 400);
    const badAgentParam = await app.request('/stores/euria/grants/', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(badAgentParam.status, 404, 'a missing agent hits no route at all');
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('hand-edited rows while running refuse the mint as drift, and revert re-opens it', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    const first = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    const { secret: held } = (await first.json()) as { secret: string };
    // A hand edits the credential rows while the server runs.
    writeFileSync(
      space.configPath,
      JSON.stringify(
        {
          tokens: [
            { agent: 'intruder', secret: `souv-${'c'.repeat(32)}`, store: 'euria', mode: 'rw' },
          ],
          management: MANAGEMENT,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    const before = readFileSync(space.configPath, 'utf8');
    const drift = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'scribe', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(drift.status, 409);
    assert.match(
      ((await drift.json()) as { error: string }).error,
      /restart to apply them/,
      'the drift teaches the remedy',
    );
    // The refusal touched nothing: the file keeps the hand's rows byte
    // for byte, and the LIVE state keeps serving its own echo.
    assert.equal(readFileSync(space.configPath, 'utf8'), before);
    const still = await app.request('/memories', {
      headers: { authorization: `Bearer ${held}` },
    });
    assert.equal(still.status, 200);
    // Reverting the file to the live echo re-opens the mint.
    const liveEcho = JSON.stringify(
      {
        tokens: [{ agent: 'atlas', secret: held, store: 'euria', mode: 'ro' }],
        management: MANAGEMENT,
      },
      null,
      2,
    );
    writeFileSync(space.configPath, liveEcho, { mode: 0o600 });
    const after = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'scribe', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(after.status, 201, 'a reverted file re-opens the mint');
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('a file that no longer parses refuses the mint 500, and the live state keeps serving', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    const first = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    const { secret: held } = (await first.json()) as { secret: string };
    writeFileSync(space.configPath, 'this is not json');
    const res = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'scribe', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /unreadable|broken/);
    // The live credential state is unaffected: the held secret still speaks.
    const still = await app.request('/memories', { headers: { authorization: `Bearer ${held}` } });
    assert.equal(still.status, 200);
    // Fixing the file (the live echo — including the row the wire minted
    // earlier, still seated in the state) re-opens the mint.
    writeFileSync(
      space.configPath,
      JSON.stringify(
        {
          tokens: [{ agent: 'atlas', secret: held, store: 'euria', mode: 'ro' }],
          management: MANAGEMENT,
        },
        null,
        2,
      ),
    );
    const fixed = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'scribe', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(fixed.status, 201);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('a boot with no config file on record: mint and revoke refuse the teaching, the list serves', async () => {
  const space = workspace(undefined);
  const registry = Registry.open(space.storesDir);
  const app = createApp({
    registry,
    tokens: [],
    management: MANAGEMENT,
    version: 'test',
  });
  try {
    registry.create('euria');
    const mint = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(mint.status, 500);
    assert.match(((await mint.json()) as { error: string }).error, /no config file on record/);
    const revoke = await app.request('/stores/euria/grants/atlas', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(revoke.status, 500);
    assert.match(((await revoke.json()) as { error: string }).error, /no config file on record/);
    const list = await app.request('/stores/euria/grants', { headers: MANAGEMENT_BEARER });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), []);
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('the minted row on disk is the truth the next boot serves — no restart-to-apply window', async () => {
  const space = workspace({ tokens: [], management: MANAGEMENT });
  const first = boot(space, { tokens: [], management: MANAGEMENT });
  first.registry.create('euria');
  const mint = await first.app.request('/stores/euria/grants', {
    method: 'POST',
    body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
    headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
  });
  const { secret } = (await mint.json()) as { secret: string };
  // The first boot ends: the ownership lock releases, the file holds the row.
  first.registry.close();
  const families = loadConfig(space.configPath);
  const second = Registry.open(space.storesDir);
  try {
    const nextApp = createApp({
      registry: second,
      tokens: families.tokens,
      management: families.management,
      configPath: space.configPath,
      version: 'test',
    });
    const served = await nextApp.request('/memories', {
      headers: { authorization: `Bearer ${secret}` },
    });
    assert.equal(served.status, 200);
    // The list, from a fresh boot, speaks the same rows.
    const list = await nextApp.request('/stores/euria/grants', { headers: MANAGEMENT_BEARER });
    assert.deepEqual(await list.json(), [{ agent: 'atlas', store: 'euria', mode: 'ro' }]);
    second.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});

test('the surgery rides the sibling keys: port, logRequests, the hand\u2019s storesDir', async () => {
  const space = workspace({
    port: 4020,
    logRequests: true,
    host: '127.0.0.1',
    tokens: [],
    management: MANAGEMENT,
  });
  const { app, registry } = boot(space, { tokens: [], management: MANAGEMENT });
  try {
    registry.create('euria');
    const res = await app.request('/stores/euria/grants', {
      method: 'POST',
      body: JSON.stringify({ agent: 'atlas', mode: 'ro' }),
      headers: { 'content-type': 'application/json', ...MANAGEMENT_BEARER },
    });
    assert.equal(res.status, 201);
    const doc = JSON.parse(readFileSync(space.configPath, 'utf8')) as Record<string, unknown>;
    assert.equal(doc['port'], 4020);
    assert.equal(doc['logRequests'], true);
    assert.equal(doc['host'], '127.0.0.1');
    registry.close();
  } finally {
    rmSync(space.storesDir, { recursive: true, force: true });
  }
});
