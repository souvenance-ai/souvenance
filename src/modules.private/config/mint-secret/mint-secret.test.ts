import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SOUV_SECRET } from '../config.ts';
import { mintSecret } from './mint-secret.ts';

test('the minted secret speaks the grammar at its honest minimum (128 bits)', () => {
  const secret = mintSecret();
  assert.strictEqual(secret.length, 37);
  assert.ok(SOUV_SECRET.test(secret));
});

test('two mints never collide — the generator is fresh', () => {
  const secrets = new Set(Array.from({ length: 64 }, () => mintSecret()));
  assert.strictEqual(secrets.size, 64);
});
