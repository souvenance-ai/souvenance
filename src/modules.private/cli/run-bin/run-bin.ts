/**
 * The bin as the process runs it — the composition the publication
 * ships, one helper for both bins' composition tests: the entry path
 * runs under the repo's cwd, the streams collect, the exit code rides.
 * The environment arrives whole; each test strips what it refuses (the
 * bindingless precedent: the dev's own exports must never decide a
 * verdict).
 */
import { spawn } from 'node:child_process';

export interface Spawned {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

export function runBin(
  entry: string,
  args: readonly string[],
  environment: Record<string, string | undefined>,
): Promise<Spawned> {
  return new Promise((resolve) => {
    const child = spawn('node', [entry, ...args], {
      cwd: process.cwd(),
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
