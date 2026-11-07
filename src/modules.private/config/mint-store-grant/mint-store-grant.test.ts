import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  ConfigError,
  SOUV_SECRET,
  type CredentialFamilies,
  type ManagementGrant,
  type StoreGrant,
} from '../config.ts';
import { mintSecret } from '../mint-secret/mint-secret.ts';
import { mintStoreGrant } from './mint-store-grant.ts';

const SECRET = `souv-${'a'.repeat(32)}`;
const OTHER = `souv-${'b'.repeat(32)}`;
const families: CredentialFamilies = {
  tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
  management: [{ agent: 'ops', secret: OTHER }],
};

test('a class instance as the families survives the mint — no spread of private fields', () => {
  class OnlyStoreFamily implements CredentialFamilies {
    #tokens: readonly StoreGrant[] = [
      { agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' },
    ];
    #management: readonly ManagementGrant[] = [];
    get tokens(): readonly StoreGrant[] {
      return this.#tokens;
    }
    get management(): readonly ManagementGrant[] {
      return this.#management;
    }
  }
  const { next, grant } = mintStoreGrant(new OnlyStoreFamily(), {
    agent: 'scribe',
    store: 'main',
    mode: 'ro',
  });
  assert.deepEqual(next.tokens, [
    { agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' },
    grant,
  ]);
  assert.deepEqual(next.management, []);
});

test('the mint appends the fresh row and serves it back — the caller owns the reveal', () => {
  const { next, grant } = mintStoreGrant(families, { agent: 'scribe', store: 'main', mode: 'ro' });
  assert.ok(grant.secret.startsWith('souv-'));
  assert.equal(grant.agent, 'scribe');
  assert.equal(grant.store, 'main');
  assert.equal(grant.mode, 'ro');
  assert.deepEqual(next.tokens, [...families.tokens, grant]);
  assert.deepEqual(next.management, families.management);
});

test('a second mint on the same (agent, store) pair refuses with the rotation remedy', () => {
  assert.throws(
    () => mintStoreGrant(families, { agent: 'atlas', store: 'main', mode: 'ro' }),
    (err: unknown) =>
      err instanceof ConfigError &&
      /already holds a grant/.test((err as Error).message) &&
      /revoking, then minting again/.test((err as Error).message),
  );
});

test('the same agent on another store, or another agent on the same store, both mint', () => {
  const sameAgent = mintStoreGrant(families, { agent: 'atlas', store: 'forked', mode: 'ro' });
  assert.ok(sameAgent.next.tokens.some((row) => row.store === 'forked'));
  const sameStore = mintStoreGrant(families, { agent: 'scribe', store: 'main', mode: 'rw' });
  assert.ok(sameStore.next.tokens.some((row) => row.agent === 'scribe'));
});

test('a generated secret that names an existing row is redrawn — the invariant holds at birth', () => {
  let draw = 0;
  const { grant } = mintStoreGrant(families, { agent: 'scribe', store: 'main', mode: 'ro' }, () =>
    draw++ === 0 ? SECRET : mintSecret(),
  );
  assert.notEqual(grant.secret, SECRET);
  assert.ok(SOUV_SECRET.test(grant.secret));
  assert.equal(draw, 2);
});

test('a generator that never draws fresh refuses after its patient attempts', () => {
  // Every draw collides: the mint gives the source eight chances.
  const drawn: string[] = [];
  assert.throws(
    () =>
      mintStoreGrant(
        families,
        { agent: 'scribe', store: 'main', mode: 'ro' },
        () => (drawn.push(SECRET), SECRET),
      ),
    (err: unknown) => /secrets collided/.test((err as Error).message),
  );
  assert.equal(drawn.length, 8);
});
