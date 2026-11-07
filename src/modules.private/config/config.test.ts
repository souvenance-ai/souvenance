import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import {
  defaultLogPath,
  ConfigError,
  loadConfig,
  parseConfig,
  resolveLogRequests,
} from './config.ts';

const SECRET = `souv-${'a'.repeat(32)}`;
const MANAGEMENT_SECRET = `souv-${'b'.repeat(32)}`;

function tempConfigPath(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-config-test-'));
  const path = join(dir, 'config.json');
  writeFileSync(path, content);
  return path;
}

test('parseConfig applies the defaults — a cold host is the boot\u2019s verdict, not the file\u2019s', () => {
  const config = parseConfig({});
  assert.equal(config.port, 3141);
  assert.equal(config.host, '127.0.0.1');
  assert.ok(config.storesDir.endsWith('stores'));
  assert.deepEqual(config.tokens, []);
  assert.deepEqual(config.management, []);
});

test('parseConfig keeps the given values and expands a leading ~', () => {
  const config = parseConfig({
    port: 8080,
    host: '0.0.0.0',
    storesDir: '~/memory-stores',
    logRequests: '~/requests.jsonl',
    tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
    management: [{ agent: 'ops', secret: MANAGEMENT_SECRET }],
  });
  assert.equal(config.port, 8080);
  assert.equal(config.host, '0.0.0.0');
  assert.ok(!config.storesDir.startsWith('~'));
  // The request log's path rides the same one convenience (#69).
  const logRequests = config.logRequests ?? '';
  assert.ok(!logRequests.startsWith('~'));
  assert.ok(logRequests.endsWith('requests.jsonl'));
  assert.equal(config.tokens.length, 1);
  assert.deepEqual(config.tokens[0], {
    agent: 'atlas',
    secret: SECRET,
    store: 'main',
    mode: 'rw',
  });
  assert.deepEqual(config.management, [{ agent: 'ops', secret: MANAGEMENT_SECRET }]);
});

test('an unknown key refuses — a typo must never silently mean nothing', () => {
  assert.throws(() => parseConfig({ token: [] }), ConfigError);
});

test('a non-string, non-boolean logRequests refuses — a number is neither a path nor the shorthand (#69)', () => {
  assert.throws(() => parseConfig({ logRequests: 42 }), ConfigError);
});

test('logRequests: true resolves to the default path, false is the explicit off (#69)', () => {
  const on = parseConfig({ logRequests: true });
  assert.equal(on.logRequests, defaultLogPath());
  assert.ok(on.logRequests.endsWith('logs.jsonl'));
  assert.ok(!on.logRequests.startsWith('~'));
  const off = parseConfig({ logRequests: false });
  assert.equal(off.logRequests, undefined);
  const bare = parseConfig({});
  assert.equal(bare.logRequests, undefined);
});

test('resolveLogRequests: the one grammar the flag and the file share (#69)', () => {
  assert.equal(resolveLogRequests(true), defaultLogPath());
  assert.equal(resolveLogRequests(false), undefined);
  assert.equal(resolveLogRequests(undefined), undefined);
  assert.equal(resolveLogRequests('~/a.jsonl'), join(homedir(), 'a.jsonl'));
});

test('a store grant carrying the retired manage flag refuses — the cap is a family now (#63)', () => {
  assert.throws(
    () =>
      parseConfig({
        tokens: [{ agent: 'a', secret: SECRET, store: 'main', mode: 'rw', manage: true }],
      }),
    ConfigError,
  );
});

test('a secret naming two rows refuses — resolution must stay unambiguous (#63)', () => {
  // Across the two families.
  assert.throws(
    () =>
      parseConfig({
        tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
        management: [{ agent: 'ops', secret: SECRET }],
      }),
    /share one secret/,
  );
  // Within one family.
  assert.throws(
    () =>
      parseConfig({
        tokens: [
          { agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' },
          { agent: 'atlas', secret: SECRET, store: 'other', mode: 'ro' },
        ],
      }),
    /share one secret/,
  );
});

test('a malformed grant refuses with the teaching', () => {
  // Bad secret grammar: uppercase hex is not ours.
  assert.throws(
    () => parseConfig({ tokens: [{ agent: 'a', secret: 'souv-XYZ', store: 'main', mode: 'rw' }] }),
    /souv-/,
  );
  // Bad store name: the grammar is `^[a-z][a-z0-9-]{0,31}$`.
  assert.throws(
    () => parseConfig({ tokens: [{ agent: 'a', secret: SECRET, store: 'Main', mode: 'rw' }] }),
    ConfigError,
  );
  // Bad mode.
  assert.throws(
    () => parseConfig({ tokens: [{ agent: 'a', secret: SECRET, store: 'main', mode: 'admin' }] }),
    ConfigError,
  );
});

test('loadConfig on a missing file serves the defaults', () => {
  const config = loadConfig('/nonexistent/souvenance/config.json');
  assert.equal(config.port, 3141);
  assert.deepEqual(config.tokens, []);
  assert.deepEqual(config.management, []);
});

test('loadConfig on malformed JSON refuses — same refusal as a bad shape', () => {
  const path = tempConfigPath('{ not json');
  try {
    assert.throws(() => loadConfig(path), ConfigError);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('the malformed-JSON refusal never quotes the file — the raw text never crosses a refusal', () => {
  const path = tempConfigPath(`{"marker": "RAW-CONFIG-TEXT"`);
  try {
    assert.throws(
      () => loadConfig(path),
      (err: unknown): boolean =>
        err instanceof ConfigError && !err.message.includes('RAW-CONFIG-TEXT'),
    );
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('loadConfig on a valid file resolves it', () => {
  const path = tempConfigPath(JSON.stringify({ port: 9999 }));
  try {
    assert.equal(loadConfig(path).port, 9999);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});
