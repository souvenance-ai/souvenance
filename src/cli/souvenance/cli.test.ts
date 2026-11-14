/**
 * The bin as the process runs it — the composition the publication
 * ships. The pins here are the parser's and the binding's: the
 * one-document contract holds bin-wide (the souv bin's precedent,
 * extended to the second bin), and the manager's binding refusal is
 * the 78 verdict. The wire round-trips live with the actions' tests.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, afterAll } from 'vitest';

const REPO = process.cwd();

/** A HOME without a config file — the cold host: the binding's none-row verdict. */
const COLD_HOME = mkdtempSync(join(tmpdir(), 'souvenance-bin-'));

afterAll(() => {
  rmSync(COLD_HOME, { recursive: true, force: true });
});

interface Spawned {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

function runBin(args: readonly string[], home: string): Promise<Spawned> {
  return new Promise((resolve) => {
    // The binding's env vars leave: the dev's own exports must never
    // decide the verdict (the souv bin's bindingless precedent).
    const environment: Record<string, string | undefined> = { ...process.env, HOME: home };
    delete environment['SOUVENANCE_URL'];
    delete environment['SOUVENANCE_TOKEN'];
    const child = spawn('node', ['src/cli/souvenance/cli.ts', ...args], {
      cwd: REPO,
      env: environment,
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

test('an unknown command serves the envelope on stdout, exit 1 — the parser\u2019s own refusal, bin-wide', async () => {
  const { stdout, code } = await runBin(['bogus'], COLD_HOME);
  assert.equal(code, 1);
  const document = JSON.parse(stdout) as { error: string };
  assert.match(document.error, /bogus|unknown command/i);
});

test('the wire world bindingless refuses 78 — no management row, the offline mint taught', async () => {
  const { stdout, code } = await runBin(['stores', 'list'], COLD_HOME);
  assert.equal(code, 78);
  const document = JSON.parse(stdout) as { error: string };
  assert.match(document.error, /no management row/);
  assert.match(document.error, /souvenance grant management add/);
});

test('the help lands its text on stdout with the zero exit — the contract\u2019s letter holds', async () => {
  const { stdout, code } = await runBin(['--help'], COLD_HOME);
  assert.equal(code, 0);
  assert.match(stdout, /the host\u2019s tool/);
});
