import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ConfigError, type Config } from '../../../../modules.private/config/config.ts';
import { resolveManagerBinding } from './manager-binding.ts';

/** A minimal resolved config — the fields the binding reads, defaults elsewhere. */
function config(rows: readonly { agent: string; secret: string }[]): Config {
  return {
    tokens: [],
    management: rows.map((row) => ({ ...row })),
    port: 3141,
    host: '127.0.0.1',
    storesDir: '/tmp/somewhere',
  };
}

function resolve(
  environment: Record<string, string | undefined>,
  rows: readonly { agent: string; secret: string }[] = [],
): { url: string; token: string } {
  return resolveManagerBinding(environment, config(rows));
}

test('the config resolves both sides — the URL from host:port, the token from the one management row', () => {
  const binding = resolve({}, [{ agent: 'valentin', secret: 'souv-aaaa' }]);
  assert.equal(binding.url, 'http://127.0.0.1:3141');
  assert.equal(binding.token, 'souv-aaaa');
});

test('the config\u2019s own host and port compose the URL — not the defaults\u2019, the file\u2019s', () => {
  const binding = resolveManagerBinding(
    {},
    { ...config([{ agent: 'valentin', secret: 'souv-aaaa' }]), host: '192.168.1.10', port: 5000 },
  );
  assert.equal(binding.url, 'http://192.168.1.10:5000');
});

test('SOUVENANCE_URL overrides the URL alone — the token still comes from the config', () => {
  const binding = resolve({ SOUVENANCE_URL: 'http://remote.example.com:4000/' }, [
    { agent: 'valentin', secret: 'souv-aaaa' },
  ]);
  assert.equal(binding.url, 'http://remote.example.com:4000');
  assert.equal(binding.token, 'souv-aaaa');
});

test('SOUVENANCE_TOKEN overrides the token alone — the URL still comes from the config', () => {
  const binding = resolve({ SOUVENANCE_TOKEN: 'souv-bbbb' }, [
    { agent: 'valentin', secret: 'souv-aaaa' },
  ]);
  assert.equal(binding.url, 'http://127.0.0.1:3141');
  assert.equal(binding.token, 'souv-bbbb');
});

test('the env pair carries a remote gesture with no file at all — no management rows needed', () => {
  const binding = resolve({
    SOUVENANCE_URL: 'https://host.example.com',
    SOUVENANCE_TOKEN: 'souv-cccc',
  });
  assert.equal(binding.url, 'https://host.example.com');
  assert.equal(binding.token, 'souv-cccc');
});

test('an explicit token silences the config\u2019s ambiguity — several rows, no refusal', () => {
  const binding = resolve({ SOUVENANCE_TOKEN: 'souv-bbbb' }, [
    { agent: 'a', secret: 'souv-aaaa' },
    { agent: 'b', secret: 'souv-bbbb' },
  ]);
  assert.equal(binding.token, 'souv-bbbb');
});

test('an empty or blank env var is no override — the config\u2019s rows serve', () => {
  const binding = resolve({ SOUVENANCE_TOKEN: '   ' }, [
    { agent: 'valentin', secret: 'souv-aaaa' },
  ]);
  assert.equal(binding.token, 'souv-aaaa');
});

test('no management row and no token refuses with the teaching — the offline mint named', () => {
  assert.throws(
    () => resolve({}),
    (error: unknown): error is ConfigError =>
      error instanceof ConfigError &&
      error.message.includes('no management row') &&
      error.message.includes('souvenance grant management add'),
  );
});

test('several management rows refuse naming the labels — the file is ambiguous about who calls', () => {
  assert.throws(
    () =>
      resolve({}, [
        { agent: 'valentin', secret: 'souv-aaaa' },
        { agent: 'backup', secret: 'souv-bbbb' },
      ]),
    (error: unknown): error is ConfigError =>
      error instanceof ConfigError &&
      error.message.includes('2 management rows (valentin, backup)'),
  );
});

test('a malformed env URL refuses with the binding\u2019s teaching — the shared grammar (ADR 0008)', () => {
  assert.throws(
    () => resolve({ SOUVENANCE_URL: 'ftp://nope' }),
    (error: unknown): error is ConfigError =>
      error instanceof ConfigError && error.message.includes('must speak http or https'),
  );
});
