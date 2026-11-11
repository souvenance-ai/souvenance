import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'vitest';

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
