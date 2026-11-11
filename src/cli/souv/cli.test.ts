import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'vitest';
import { bootTestWire } from '../../modules.private/cli/test-wire/test-wire.ts';

const REPO = process.cwd();

interface Spawned {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

/** The bin as the process runs it — the composition the publication ships. */
function runBin(
  args: readonly string[],
  env: Record<string, string | undefined>,
): Promise<Spawned> {
  return new Promise((resolve) => {
    const child = spawn('node', ['src/cli/souv/cli.ts', ...args], {
      cwd: REPO,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

/** The environment without the binding — the token's absence is the 78 verdict. */
function bindingless(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env['SOUVENANCE_URL'];
  delete env['SOUVENANCE_TOKEN'];
  return env;
}

test('the bin refuses without the binding — one envelope on stdout, exit 78', async () => {
  const run = await runBin(['memory', 'list'], bindingless());
  assert.equal(run.code, 78);
  const document = JSON.parse(run.stdout) as { error: unknown };
  assert.match(String(document.error), /SOUVENANCE_TOKEN is absent/);
});

test('--help works bindingless — the bin\u2019s own door, no envelope demanded', async () => {
  const run = await runBin(['--help'], bindingless());
  assert.equal(run.code, 0);
  assert.match(run.stdout, /memory/);
});

test('the parser\u2019s refusals teach on stdout — one envelope, exit 1 (a missing option value)', async () => {
  const run = await runBin(['memory', 'store', 'hello', '--kind'], bindingless());
  assert.equal(run.code, 1);
  const document = JSON.parse(run.stdout) as { error: unknown };
  assert.match(String(document.error), /--kind/);
});

test('an unknown option refuses in the envelope\u2019s voice', async () => {
  const run = await runBin(['memory', 'list', '--nope'], bindingless());
  assert.equal(run.code, 1);
  const document = JSON.parse(run.stdout) as { error: unknown };
  assert.match(String(document.error), /--nope|unknown option/i);
});

test('an unknown command refuses in the envelope\u2019s voice', async () => {
  const run = await runBin(['frobnicate'], bindingless());
  assert.equal(run.code, 1);
  const document = JSON.parse(run.stdout) as { error: unknown };
  assert.match(String(document.error), /frobnicate|unknown command/i);
});

test('a malformed numeric flag rides to the wire\u2019s judge — the truth, not a silent parse', async () => {
  // parseInt('2.5') was 2 — silently accepted. Number('2.5') is 2.5,
  // and the wire's int shape refuses it with its teaching.
  const wire = await bootTestWire();
  try {
    const env = {
      ...process.env,
      SOUVENANCE_URL: wire.store.url,
      SOUVENANCE_TOKEN: wire.store.token,
    };
    const run = await runBin(['memory', 'list', '--limit', '2.5'], env);
    assert.equal(run.code, 1);
    const document = JSON.parse(run.stdout) as { error: unknown };
    assert.match(String(document.error), /limit|integer|expected/i);
  } finally {
    await wire.close();
  }
});

test('a body that does not travel refuses in the envelope\u2019s voice — valid JSON, serializer-refused depths', async () => {
  // Valid JSON that parses but nests past the serializer's ceiling: the
  // parse gate passes, the stringify would RangeError outside any
  // try/catch — the Copilot round's find. The wire's own birth
  // ceremony + the real bin, end to end.
  const wire = await bootTestWire();
  try {
    const deep = '{"a": ' + '['.repeat(16_000) + '1' + ']'.repeat(16_000) + '}';
    const env = {
      ...process.env,
      SOUVENANCE_URL: wire.store.url,
      SOUVENANCE_TOKEN: wire.store.token,
    };
    const run = await runBin(
      ['memory', 'store', 'hello', '--kind', 'note', '--metadata', deep],
      env,
    );
    assert.equal(run.code, 1);
    const document = JSON.parse(run.stdout) as { error: unknown };
    assert.match(String(document.error), /does not travel/);
  } finally {
    await wire.close();
  }
});
