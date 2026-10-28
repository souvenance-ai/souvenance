import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { Store } from '../../store/store.ts';
import { StoreError } from '../../store/store-error/store-error.ts';
import { Registry } from './registry.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-registry-test-'));
}

/** Creates one seeded store file directly on disk (the way a past boot left it). */
function seedStore(dir: string, name: string, content = 'remembered'): void {
  const store = Store.open({ dbPath: join(dir, `${name}.db`) });
  store.store(content, { kind: 'note' });
  store.close();
}

function codeOf(operation: () => unknown): string {
  try {
    operation();
  } catch (err) {
    assert.ok(err instanceof StoreError, `expected StoreError, got ${(err as Error).message}`);
    return err.code;
  }
  throw new Error('expected the operation to refuse');
}

test('open on an empty dir creates it and serves no stores', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    assert.deepEqual(registry.names(), []);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('boot cold-opens every store file — the dir is the registry', () => {
  const dir = tempDir();
  try {
    seedStore(dir, 'atlas');
    const registry = Registry.open(dir);
    assert.deepEqual(registry.names(), ['atlas']);
    const served = registry.get('atlas');
    assert.ok(served !== undefined);
    assert.equal(served.list().length, 1);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a store file breaking the grammar kills the boot — half a registry is a lie', () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, 'Atlas.db'), 'not a store');
    assert.throws(() => Registry.open(dir), /breaks the store-name grammar/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('create refuses bad grammar and collisions with StoreError codes', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    assert.equal(
      codeOf(() => registry.create('BadName')),
      'invalid',
    );
    registry.create('main');
    assert.ok(registry.get('main') !== undefined);
    assert.equal(
      codeOf(() => registry.create('main')),
      'conflict',
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fork composes the first free child name when absent', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    registry.create('atlas');
    assert.equal(registry.fork('atlas'), 'atlas-fork');
    assert.equal(registry.fork('atlas'), 'atlas-fork-2');
    const child = registry.get('atlas-fork');
    assert.ok(child !== undefined);
    assert.equal(child.list().length, 0, 'an empty source forks empty');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the fork carries the memories — an exact copy', () => {
  const dir = tempDir();
  try {
    seedStore(dir, 'atlas', 'the remembered thing');
    const reopened = Registry.open(dir);
    assert.equal(reopened.fork('atlas', 'copy'), 'copy');
    const child = reopened.get('copy');
    assert.ok(child !== undefined);
    assert.equal(child.list().length, 1);
    assert.equal(child.list()[0].content, 'the remembered thing');
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fork takes an explicit child name and refuses collisions and unknown sources', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    registry.create('atlas');
    assert.equal(registry.fork('atlas', 'copy'), 'copy');
    assert.equal(
      codeOf(() => registry.fork('atlas', 'copy')),
      'conflict',
    );
    assert.equal(
      codeOf(() => registry.fork('atlas', 'Copy')),
      'invalid',
    );
    assert.equal(
      codeOf(() => registry.fork('nowhere', 'child')),
      'not_found',
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remove deletes the trio and the lock; unknown names refuse', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    registry.create('main');
    registry.remove('main');
    assert.ok(!existsSync(join(dir, 'main.db')));
    assert.ok(!existsSync(join(dir, 'main.db-wal')));
    assert.ok(!existsSync(join(dir, 'main.lock')));
    assert.deepEqual(registry.names(), []);
    assert.equal(
      codeOf(() => registry.remove('main')),
      'not_found',
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('close releases the locks — the next boot claims them again', () => {
  const dir = tempDir();
  try {
    seedStore(dir, 'atlas');
    const first = Registry.open(dir);
    first.close();
    const second = Registry.open(dir);
    assert.deepEqual(second.names(), ['atlas']);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a corrupt store file kills the boot — the failure is loud, the store untouched', () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, 'broken.db'), 'this is not sqlite');
    assert.throws(() => Registry.open(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
