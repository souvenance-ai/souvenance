import assert from 'node:assert/strict';
import { test } from 'vitest';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { onWire, UNREACHABLE } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import {
  AGENT_REQUIRED,
  DOT_AGENT_REFUSAL,
  MODE_TEACHING,
} from '../../../../modules.private/config/mint-doors/mint-doors.ts';
import { storesGrantsList, storesGrantsMint, storesGrantsRevoke } from './stores-grants.ts';

test('mint serves the response verbatim — the secret included, no TTY gate', async () => {
  await onWire(async (wire) => {
    const answer = await storesGrantsMint(wire.management, {
      store: wire.storeName,
      agent: 'bridge',
      mode: 'ro',
    });
    assert.equal(answer.exitCode, 0);
    const minted = answer.document as {
      agent: string;
      store: string;
      mode: string;
      secret: string;
    };
    assert.deepEqual(
      { agent: minted.agent, store: minted.store, mode: minted.mode },
      { agent: 'bridge', store: wire.storeName, mode: 'ro' },
    );
    assert.match(minted.secret, /^souv-[0-9a-f]{32,64}$/);
  });
});

test('mint forwards the duplicate\u2019s 409 verbatim — the rotation remedy taught', async () => {
  await onWire(async (wire) => {
    await storesGrantsMint(wire.management, {
      store: wire.storeName,
      agent: 'bridge',
      mode: 'ro',
    });
    const answer = await storesGrantsMint(wire.management, {
      store: wire.storeName,
      agent: 'bridge',
      mode: 'rw',
    });
    assert.equal(answer.exitCode, 1);
    const document = answer.document as { error: string };
    assert.equal(
      document.error,
      `"bridge" already holds a grant on "${wire.storeName}" — one row per agent ` +
        'and store; rotate the secret or change the mode by revoking, then minting again',
    );
  });
});

test('mint forwards the dot agent\u2019s refusal — the wire\u2019s own words, the body\u2019s judge', async () => {
  await onWire(async (wire) => {
    const answer = await storesGrantsMint(wire.management, {
      store: wire.storeName,
      agent: '..',
      mode: 'ro',
    });
    assert.equal(answer.exitCode, 1);
    const document = answer.document as { error: string };
    // The body's judge is the wire's own: the defaultHook's envelope
    // names the field, the schema's teaching names the two labels.
    assert.match(document.error, /^invalid request — agent: /);
    assert.match(document.error, /"\." and "\.\." refuse/);
  });
});

test('mint forwards the wrong mode\u2019s refusal — the wire judges the body', async () => {
  await onWire(async (wire) => {
    const answer = await storesGrantsMint(wire.management, {
      store: wire.storeName,
      agent: 'bridge',
      mode: 'admin',
    });
    assert.equal(answer.exitCode, 1);
    const document = answer.document as { error: string };
    assert.match(document.error, /^invalid request — mode: /);
    assert.match(document.error, /"ro"\|"rw"/);
  });
});

test('mint\u2019s missing args refuse locally — the mint doors\u2019 shared voice', async () => {
  const storeless = await storesGrantsMint(UNREACHABLE, { agent: 'a', mode: 'ro' });
  assert.deepEqual(storeless.document, {
    error: 'the store name is missing — pass it as the command\u2019s first argument',
  });
  const agentless = await storesGrantsMint(UNREACHABLE, { store: 's', mode: 'ro' });
  assert.deepEqual(agentless.document, { error: AGENT_REQUIRED });
  const modeless = await storesGrantsMint(UNREACHABLE, { store: 's', agent: 'a' });
  assert.deepEqual(modeless.document, { error: MODE_TEACHING });
});

test('list serves the rows verbatim — never a secret', async () => {
  await onWire(async (wire) => {
    await storesGrantsMint(wire.management, {
      store: wire.storeName,
      agent: 'bridge',
      mode: 'ro',
    });
    const answer = await storesGrantsList(wire.management, { store: wire.storeName });
    assert.equal(answer.exitCode, 0);
    const rows = answer.document as readonly { agent: string; store: string; mode: string }[];
    assert.ok(rows.some((row) => row.agent === 'bridge' && row.mode === 'ro'));
    assert.ok(
      rows.every((row) => !('secret' in row)),
      'the secret is never on this wire',
    );
  });
});

test('revoke\u2019s 204 serves the gesture\u2019s echo — the mirror of the delete\u2019s', async () => {
  await onWire(async (wire) => {
    const minted = await storesGrantsMint(wire.management, {
      store: wire.storeName,
      agent: 'bridge',
      mode: 'ro',
    });
    const secret = (minted.document as { secret: string }).secret;
    const answer = await storesGrantsRevoke(wire.management, {
      store: wire.storeName,
      agent: 'bridge',
    });
    assert.equal(answer.exitCode, 0);
    assert.deepEqual(answer.document, {
      agent: 'bridge',
      store: wire.storeName,
      revoked: true,
    });
    // The revocation is immediate on both sources of truth — the next
    // request with the revoked secret refuses.
    const latecomer = await httpCall(
      { url: wire.store.url, token: secret },
      { method: 'get', path: '/memories' },
    );
    assert.equal(latecomer.status, 401);
  });
});

test('revoke forwards the unknown grant\u2019s 404 verbatim', async () => {
  await onWire(async (wire) => {
    const answer = await storesGrantsRevoke(wire.management, {
      store: wire.storeName,
      agent: 'ghost',
    });
    assert.equal(answer.exitCode, 1);
    assert.deepEqual(answer.document, { error: 'no grant for "ghost" on this store' });
  });
});

test('revoke\u2019s dot agent refuses locally, before any call — the revoke URL could never address it', async () => {
  const answer = await storesGrantsRevoke(UNREACHABLE, { store: 'somewhere', agent: '.' });
  assert.equal(answer.exitCode, 1);
  assert.deepEqual(answer.document, { error: DOT_AGENT_REFUSAL });
});
