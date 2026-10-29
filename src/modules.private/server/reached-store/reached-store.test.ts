/**
 * The data routes' doors, unit-pinned: the reach refuses a foreign store
 * BEFORE existence is spoken — the registry's contents are not a foreign
 * grant's business (Q8) — and the write door walks reach, then mode, in
 * that order, structurally. The route files call these; this file pins
 * the gates themselves.
 */
import assert from 'node:assert/strict';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { Registry } from '../registry/registry.ts';
import type { ResolvedGrant, ServerEnv } from '../auth/auth.ts';
import { reachedStore, writableStore } from './reached-store.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-reached-store-test-'));
}

/** The context stub: the gate reads the resolved grant, nothing else. */
function context(grant: ResolvedGrant): Context<ServerEnv> {
  return { get: () => grant } as unknown as Context<ServerEnv>;
}

function grantAt(store: string, mode: 'ro' | 'rw'): ResolvedGrant {
  return { agent: 'nova', store, mode, manage: false, operator: false, key: 'nova' };
}

function httpStatusOf(operation: () => unknown): number {
  try {
    operation();
  } catch (err) {
    assert.ok(
      err instanceof HTTPException,
      `expected HTTPException, got ${(err as Error).message}`,
    );
    return err.status;
  }
  throw new Error('expected the gate to refuse');
}

test('the reach refuses a foreign store before existence is spoken', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    const status = httpStatusOf(() =>
      reachedStore(context(grantAt('atlas', 'ro')), registry, 'elsewhere'),
    );
    assert.equal(status, 403);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a reached store that does not exist refuses not_found — the order already held', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    try {
      reachedStore(context(grantAt('atlas', 'ro')), registry, 'atlas');
      throw new Error('expected the gate to refuse');
    } catch (err) {
      assert.equal((err as { code?: string }).code, 'not_found');
    }
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the write door hands the store to a grant that reaches AND may write', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    const atlas = registry.create('atlas');
    const reached = writableStore(context(grantAt('atlas', 'rw')), registry, 'atlas');
    assert.equal(reached, atlas, 'the door is the store, not a copy');
    assert.equal(
      httpStatusOf(() => writableStore(context(grantAt('atlas', 'ro')), registry, 'atlas')),
      403,
    );
    assert.equal(
      httpStatusOf(() => writableStore(context(grantAt('atlas', 'rw')), registry, 'elsewhere')),
      403,
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
