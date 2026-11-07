import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { CredentialFamilies } from '../../config/config.ts';
import { LiveCredentials } from './live-credentials.ts';

const families: CredentialFamilies = {
  tokens: [{ agent: 'atlas', secret: `souv-${'a'.repeat(32)}`, store: 'euria', mode: 'ro' }],
  management: [{ agent: 'ops', secret: `souv-${'b'.repeat(32)}` }],
};

test('the boot families resolve: the store first, the management second, the miss undefined', () => {
  const live = LiveCredentials.from(families);
  const spoke = live.resolve(families.tokens[0]!.secret);
  assert.deepEqual(spoke, {
    family: 'store',
    agent: 'atlas',
    store: 'euria',
    mode: 'ro',
    key: spoke?.key,
  });
  const managed = live.resolve(families.management[0]!.secret);
  assert.deepEqual(
    { family: managed?.family, agent: managed?.agent },
    {
      family: 'management',
      agent: 'ops',
    },
  );
  assert.equal(live.resolve(`souv-${'c'.repeat(32)}`), undefined, 'the miss is a miss');
});

test('assume seats the next state — the swap is instant, no permission ceremony', () => {
  const live = LiveCredentials.from(families);
  const fresh = `souv-${'d'.repeat(32)}`;
  live.assume({
    tokens: [...families.tokens, { agent: 'scribe', secret: fresh, store: 'euria', mode: 'rw' }],
    management: families.management,
  });
  assert.equal(live.resolve(fresh)?.agent, 'scribe');
  // A revoked row (assumed out) stops resolving immediately.
  live.assume({ tokens: families.tokens, management: families.management });
  assert.equal(live.resolve(fresh), undefined);
});

test('the state is the boot\u2019s copy — mutating it moves neither the caller\u2019s families', () => {
  const live = LiveCredentials.from(families);
  live.assume({ tokens: [], management: [] });
  assert.equal(families.tokens.length, 1, 'the boot families kept their row');
});
