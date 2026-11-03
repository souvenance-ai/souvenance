/**
 * The data routes' doors, unit-pinned: the family gate refuses a
 * management grant before anything else, the registry speaks existence —
 * an orphaned grant (its store gone mid-run) serves 404, the one
 * existence answer left (#74) — and the write door walks family,
 * existence, then mode, in that order, structurally. The route files
 * call these; this file pins the gates themselves.
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
  return { family: 'store', agent: 'nova', store, mode, key: 'nova' };
}

function managementGrant(): ResolvedGrant {
  return { family: 'management', agent: 'ops', key: 'ops' };
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

test('an orphaned grant serves not_found — the registry speaks existence (#74)', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    // The grant names a store the registry never opened — the mid-run
    // delete's shape: the grant survives, its store is gone.
    try {
      reachedStore(context(grantAt('atlas', 'ro')), registry);
      throw new Error('expected the gate to refuse');
    } catch (err) {
      assert.equal((err as { code?: string }).code, 'not_found');
    }
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a management grant refuses at the family gate — before existence is even asked', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    const status = httpStatusOf(() => reachedStore(context(managementGrant()), registry));
    assert.equal(status, 403);
    try {
      writableStore(context(managementGrant()), registry);
      throw new Error('expected the gate to refuse');
    } catch (err) {
      assert.ok(err instanceof HTTPException);
      assert.match(err.message, /a management grant reaches no store data/);
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
    const reached = writableStore(context(grantAt('atlas', 'rw')), registry);
    assert.equal(reached, atlas, 'the door is the store, not a copy');
    assert.equal(
      httpStatusOf(() => writableStore(context(grantAt('atlas', 'ro')), registry)),
      403,
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
