import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { configAction } from './config.ts';
import { defaultConfigPath } from '../../../modules.private/config/config.ts';

const SECRET = `souv-${'a'.repeat(32)}`;
const MANAGEMENT_SECRET = `souv-${'b'.repeat(32)}`;

function tempConfigPath(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'souvenance-config-cli-test-'));
  const path = join(directory, 'config.json');
  writeFileSync(path, content);
  return path;
}

test('file serves the path and never reads it — a malformed file is not its business', () => {
  const path = tempConfigPath('{ not json');
  try {
    const answer = configAction('file', path);
    assert.ok('file' in answer.document);
    assert.equal(answer.document.file, path);
    assert.equal(answer.exitCode, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('file defaults to the one home path when no path is given', () => {
  const answer = configAction('file');
  assert.ok('file' in answer.document);
  assert.equal(answer.document.file, defaultConfigPath());
});

test('get on a missing file serves the defaults — the cold-host view (#63)', () => {
  const answer = configAction('get', '/nonexistent/souvenance/config.json');
  assert.ok('tokens' in answer.document);
  assert.equal(answer.document.port, 3141);
  assert.equal(answer.document.host, '127.0.0.1');
  assert.deepEqual(answer.document.tokens, []);
  assert.deepEqual(answer.document.management, []);
  assert.equal(answer.exitCode, 0);
});

test('get fills the defaults over a partial file — the effective view the server boots on', () => {
  const path = tempConfigPath(JSON.stringify({ port: 8080 }));
  try {
    const answer = configAction('get', path);
    assert.ok('tokens' in answer.document);
    assert.equal(answer.document.port, 8080);
    assert.equal(answer.document.host, '127.0.0.1');
    assert.equal(answer.document.logRequests, undefined);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('get resolves the log-requests shorthand — the boolean dies, the path survives (#69)', () => {
  const path = tempConfigPath(JSON.stringify({ logRequests: true }));
  try {
    const answer = configAction('get', path);
    assert.ok('tokens' in answer.document);
    assert.ok(answer.document.logRequests?.endsWith('logs.jsonl'));
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('get redacts every secret of both families — a secret’s only doors are mint and reveal', () => {
  const path = tempConfigPath(
    JSON.stringify({
      tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
      management: [{ agent: 'ops', secret: MANAGEMENT_SECRET }],
    }),
  );
  try {
    const answer = configAction('get', path);
    assert.ok('tokens' in answer.document);
    assert.equal(answer.document.tokens[0]?.secret, 'redacted');
    assert.equal(answer.document.management[0]?.secret, 'redacted');
    // The pin: neither seeded secret appears anywhere in the served document.
    const served = JSON.stringify(answer.document);
    assert.ok(!served.includes(SECRET));
    assert.ok(!served.includes(MANAGEMENT_SECRET));
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('get refuses a malformed file — never a silent fall back to defaults', () => {
  const path = tempConfigPath('{ not json');
  try {
    const answer = configAction('get', path);
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /not valid JSON/);
    assert.equal(answer.exitCode, 78);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('the malformed-file envelope never quotes the raw text — a secret planted in broken JSON stays put', () => {
  const path = tempConfigPath(`{"tokens": [{"agent": "atlas", "secret": ${SECRET}, "mode": }]`);
  try {
    for (const command of ['get', 'validate'] as const) {
      const answer = configAction(command, path);
      assert.ok('error' in answer.document);
      assert.match(answer.document.error, /not valid JSON/);
      assert.equal(answer.exitCode, 78);
      // The pin: neither the secret nor any raw fragment of the file crosses.
      const served = JSON.stringify(answer.document);
      assert.ok(!served.includes(SECRET));
      assert.ok(!served.includes('atlas'));
    }
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('get refuses an unknown key with the module’s teaching — the envelope names the slip', () => {
  const path = tempConfigPath(JSON.stringify({ token: [] }));
  try {
    const answer = configAction('get', path);
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /invalid config/);
    assert.match(answer.document.error, /token/);
    assert.equal(answer.exitCode, 78);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('validate serves valid on a good file', () => {
  const path = tempConfigPath(
    JSON.stringify({
      tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
    }),
  );
  try {
    const answer = configAction('validate', path);
    assert.ok('valid' in answer.document);
    assert.equal(answer.document.valid, true);
    assert.equal(answer.exitCode, 0);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('validate serves valid on a missing file — a cold host is not a broken one', () => {
  const answer = configAction('validate', '/nonexistent/souvenance/config.json');
  assert.ok('valid' in answer.document);
  assert.equal(answer.document.valid, true);
  assert.equal(answer.exitCode, 0);
});

test('validate refuses a malformed grant with the teaching and exit 78', () => {
  const path = tempConfigPath(
    JSON.stringify({
      tokens: [{ agent: 'a', secret: 'souv-XYZ', store: 'main', mode: 'rw' }],
    }),
  );
  try {
    const answer = configAction('validate', path);
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /invalid config/);
    assert.equal(answer.exitCode, 78);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('validate refuses a shared secret — the #63 invariant holds at this door too', () => {
  const path = tempConfigPath(
    JSON.stringify({
      tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
      management: [{ agent: 'ops', secret: SECRET }],
    }),
  );
  try {
    const answer = configAction('validate', path);
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /share one secret/);
    assert.equal(answer.exitCode, 78);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});
