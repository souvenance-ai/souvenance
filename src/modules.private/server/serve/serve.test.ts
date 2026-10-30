/**
 * The boot ceremony's own tests (#50): the zero-credential refusal (#63 —
 * no token, no memory), the #19 grant validation — a grant naming a store
 * the registry does not open refuses the start with the teaching — and
 * the refused boot releases every claim it opened, so the same host boots
 * again without a manual lock hunt. The happy path pins the bound port's
 * resolution (the smoke test's contract) and the banner's two counts.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { Registry } from '../registry/registry.ts';
import { startServer } from './serve.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-serve-test-'));
}

function options(storesDir: string, store: string) {
  return {
    host: '127.0.0.1',
    port: 0,
    storesDir,
    tokens: [{ agent: 'nova', secret: `souv-${'b'.repeat(32)}`, store, mode: 'rw' as const }],
    management: [],
    version: 'test',
  };
}

test('a zero-credential host refuses to start — no token, no memory', async () => {
  const dir = tempDir();
  try {
    const error = await startServer({
      host: '127.0.0.1',
      port: 0,
      storesDir: dir,
      tokens: [],
      management: [],
      version: 'test',
    }).catch((err: Error) => err);
    assert.match(String(error), /zero credentials/);
    assert.match(String(error), /no token, no memory/);
    assert.match(String(error), /mint a grant/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a management-only boot serves — a fresh host is bootable and the banner counts both', async () => {
  const dir = tempDir();
  const lines: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const running = await startServer({
      host: '127.0.0.1',
      port: 0,
      storesDir: dir,
      tokens: [],
      management: [{ agent: 'ops', secret: `souv-${'a'.repeat(32)}` }],
      version: 'test',
    });
    assert.ok(running.port > 0, 'the fresh host boots on the management family alone');
    await running.close();
    const banner = lines.find((line) => line.includes('grant(s)')) ?? '';
    assert.match(banner, /0 grant\(s\) · 1 management/);
  } finally {
    process.stderr.write = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a grant naming a store the registry does not open refuses the start', async () => {
  const dir = tempDir();
  try {
    // One real store so the refusal could not be argued "empty registry" —
    // the grant names a neighbor that simply does not exist.
    const seed = Registry.open(dir);
    seed.create('atlas');
    seed.close();
    const error = await startServer(options(dir, 'nowhere')).catch((err: Error) => err);
    assert.match(String(error), /"nowhere" \(nova\)/);
    assert.match(String(error), /create the store|fix the token rows/);
    // The refused boot released its claims: the same host boots again —
    // the wedged-lock shape this test exists to forbid.
    const restarted = await startServer(options(dir, 'atlas'));
    assert.ok(restarted.port > 0);
    await restarted.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a grant naming an open store boots and resolves the bound port', async () => {
  const dir = tempDir();
  try {
    const seed = Registry.open(dir);
    seed.create('atlas');
    seed.close();
    const running = await startServer(options(dir, 'atlas'));
    assert.ok(running.port > 0);
    await running.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
