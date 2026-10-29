import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, vi } from 'vitest';
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
    assert.throws(() => Registry.open(dir), /breaks the grammar/);
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

test('fork takes an explicit forked name and refuses collisions and unknown sources', () => {
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

test('descriptors serves every open store — name plus verbatim stats, no paths', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    const main = registry.create('main');
    main.store('remembered', { kind: 'note' });
    registry.create('other');
    const descriptors = registry.descriptors();
    assert.deepEqual(
      descriptors.map((descriptor) => descriptor.name),
      ['main', 'other'],
    );
    assert.deepEqual(descriptors[0]?.stats, {
      memories: 1,
      memories_by_status: { active: 1 },
      memories_by_kind: { note: 1 },
      edges: 0,
      edges_by_kind: {},
    });
    assert.deepEqual(Object.keys(descriptors[0] ?? {}), ['name', 'stats']);
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

test('a failed fork claim leaves no store behind — the name stays free', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    const source = registry.create('atlas');
    const copy = vi.spyOn(source, 'fork').mockImplementation(() => {
      throw new Error('the copy died mid-flight');
    });
    assert.throws(() => registry.fork('atlas'), /copy died/);
    assert.ok(!existsSync(join(dir, 'atlas-fork.db')), 'the half-born store must not survive');
    assert.ok(!existsSync(join(dir, 'atlas-fork.lock')));
    copy.mockRestore();
    // The name is free and claimable again: the failed birth stays dead.
    assert.equal(registry.fork('atlas'), 'atlas-fork');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a throwing close never wedges the name — the lock releases before anything else', () => {
  const dir = tempDir();
  try {
    const registry = Registry.open(dir);
    const main = registry.create('main');
    const refusingClose = vi.spyOn(main, 'close').mockImplementation(() => {
      throw new Error('close refuses');
    });
    assert.throws(() => registry.remove('main'), /close refuses/);
    assert.ok(!existsSync(join(dir, 'main.lock')), 'the lock is gone with the handoff');
    refusingClose.mockRestore();
    main.close(); // the abandoned handle still closes — the refusal was the mock's
    const again = registry.create('main');
    assert.ok(again !== undefined, 'the name is claimable again, no heartbeat survived');
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
