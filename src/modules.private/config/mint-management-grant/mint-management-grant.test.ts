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
import { mintManagementGrant } from './mint-management-grant.ts';

const SECRET = `souv-${'a'.repeat(32)}`;
const OTHER = `souv-${'b'.repeat(32)}`;
const families: CredentialFamilies = {
  tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
  management: [{ agent: 'ops', secret: OTHER }],
};

test('a class instance as the families survives the mint — no spread of private fields', () => {
  class OnlyManagementFamily implements CredentialFamilies {
    #tokens: readonly StoreGrant[] = [
      { agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' },
    ];
    #management: readonly ManagementGrant[] = [{ agent: 'ops', secret: OTHER }];
    get tokens(): readonly StoreGrant[] {
      return this.#tokens;
    }
    get management(): readonly ManagementGrant[] {
      return this.#management;
    }
  }
  const { next, grant } = mintManagementGrant(new OnlyManagementFamily(), { agent: 'scribe' });
  assert.deepEqual(next.management, [{ agent: 'ops', secret: OTHER }, grant]);
  assert.deepEqual(next.tokens, [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }]);
});

test('the mint appends the fresh row and serves it back — the caller owns the reveal', () => {
  const { next, grant } = mintManagementGrant(families, { agent: 'scribe' });
  assert.ok(SOUV_SECRET.test(grant.secret));
  assert.equal(grant.agent, 'scribe');
  assert.deepEqual(next.management, [...families.management, grant]);
  assert.deepEqual(next.tokens, families.tokens);
});

test('a second mint on the same agent refuses — one row per agent, the remedy taught', () => {
  assert.throws(
    () => mintManagementGrant(families, { agent: 'ops' }),
    (err: unknown) =>
      err instanceof ConfigError &&
      /already holds a management grant/.test((err as Error).message) &&
      /revoking, then minting again/.test((err as Error).message),
  );
});

test('a generated secret that names an existing row is redrawn — the invariant holds at birth', () => {
  let draw = 0;
  const { grant } = mintManagementGrant(families, { agent: 'scribe' }, () =>
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
    () => mintManagementGrant(families, { agent: 'scribe' }, () => (drawn.push(SECRET), SECRET)),
    (err: unknown) => /secrets collided/.test((err as Error).message),
  );
  assert.equal(drawn.length, 8);
});
