import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { tightenPermissions } from './tighten-permissions.ts';

test('tightens the existing trio to owner-only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-tighten-'));
  try {
    const dbPath = join(dir, 'memory.db');
    writeFileSync(dbPath, 'x');
    writeFileSync(`${dbPath}-wal`, 'x');
    writeFileSync(`${dbPath}-shm`, 'x');
    chmodSync(dbPath, 0o666);
    chmodSync(`${dbPath}-wal`, 0o666);

    tightenPermissions(dbPath);

    assert.equal(statSync(dbPath).mode & 0o777, 0o600);
    assert.equal(statSync(`${dbPath}-wal`).mode & 0o777, 0o600);
    assert.equal(statSync(`${dbPath}-shm`).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing sidecar is no throw — the pass is best-effort', () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-tighten-'));
  try {
    const dbPath = join(dir, 'absent.db');
    writeFileSync(dbPath, 'x'); // no -wal, no -shm
    assert.doesNotThrow(() => tightenPermissions(dbPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
