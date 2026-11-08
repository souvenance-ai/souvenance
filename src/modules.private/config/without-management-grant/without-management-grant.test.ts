import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { CredentialFamilies } from '../config.ts';
import { withoutManagementGrant } from './without-management-grant.ts';

const families: CredentialFamilies = {
  tokens: [{ agent: 'atlas', secret: `souv-${'a'.repeat(32)}`, store: 'main', mode: 'rw' }],
  management: [{ agent: 'ops', secret: `souv-${'b'.repeat(32)}` }],
};

test('the target agent\u2019s management row leaves and the store family rides verbatim', () => {
  const { next, count } = withoutManagementGrant(families, { agent: 'ops' });
  assert.equal(count, 1);
  assert.deepEqual(next.management, []);
  assert.deepEqual(next.tokens, families.tokens);
});

test('an agent with no row removes nothing — the count tells the caller', () => {
  const { next, count } = withoutManagementGrant(families, { agent: 'ghost' });
  assert.equal(count, 0);
  assert.deepEqual(next.management, families.management);
});
