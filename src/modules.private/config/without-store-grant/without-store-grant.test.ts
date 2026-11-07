import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { CredentialFamilies, ManagementGrant, StoreGrant } from '../config.ts';
import { withoutStoreGrant } from './without-store-grant.ts';

const families: CredentialFamilies = {
  tokens: [
    { agent: 'atlas', secret: `souv-${'a'.repeat(32)}`, store: 'main', mode: 'rw' },
    { agent: 'atlas', secret: `souv-${'b'.repeat(32)}`, store: 'fork-of-euria', mode: 'ro' },
    { agent: 'scribe', secret: `souv-${'c'.repeat(32)}`, store: 'main', mode: 'rw' },
  ],
  management: [{ agent: 'ops', secret: `souv-${'d'.repeat(32)}` }],
};

test('the revocation removes exactly the (agent, store) pair\u2019s rows and counts them', () => {
  const { next, count } = withoutStoreGrant(families, { agent: 'atlas', store: 'main' });
  assert.equal(count, 1);
  assert.deepEqual(
    next.tokens.map((row) => [row.agent, row.store, row.mode]),
    [
      ['atlas', 'fork-of-euria', 'ro'],
      ['scribe', 'main', 'rw'],
    ],
  );
  // The management family is never touched by a store revocation.
  assert.deepEqual(next.management, families.management);
});

test('a class instance as the families survives the revocation — no spread of private fields', () => {
  class OnlyManagement implements CredentialFamilies {
    #tokens = [] as readonly StoreGrant[];
    #management: readonly ManagementGrant[] = [{ agent: 'ops', secret: `souv-${'z'.repeat(32)}` }];
    get tokens(): readonly StoreGrant[] {
      return this.#tokens;
    }
    get management(): readonly ManagementGrant[] {
      return this.#management;
    }
  }
  const { next, count } = withoutStoreGrant(new OnlyManagement(), { agent: 'ops', store: 'main' });
  assert.equal(count, 0);
  assert.deepEqual(next.management, [{ agent: 'ops', secret: `souv-${'z'.repeat(32)}` }]);
});

test('an unknown pair revokes nothing and counts zero — the caller serves its 404', () => {
  const missing = withoutStoreGrant(families, { agent: 'ghost', store: 'main' });
  assert.equal(missing.count, 0);
  const wrongStore = withoutStoreGrant(families, { agent: 'atlas', store: 'forked' });
  assert.equal(wrongStore.count, 0);
  assert.deepEqual(missing.next.tokens as readonly unknown[], families.tokens);
});

test('the other pair of the same agent survives the pair\u2019s revocation', () => {
  const { next } = withoutStoreGrant(families, { agent: 'atlas', store: 'fork-of-euria' });
  assert.ok(next.tokens.some((row) => row.agent === 'atlas' && row.store === 'main'));
});
