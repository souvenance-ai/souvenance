import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { OwnershipLock } from './ownership-lock.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-lock-test-'));
}

function readDoc(path: string): { pid: number; acquired_at: number; heartbeat_at: number } {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('acquire writes the claim document and release removes it', () => {
  const dir = tempDir();
  try {
    const lockPath = join(dir, 'main.lock');
    const lock = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 });
    const doc = readDoc(lockPath);
    assert.equal(doc.pid, process.pid);
    lock.release();
    assert.throws(() => readFileSync(lockPath, 'utf8'), /ENOENT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a live lock refuses the second acquirer, naming the holding pid', () => {
  const dir = tempDir();
  try {
    const lockPath = join(dir, 'main.lock');
    const lock = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 });
    assert.throws(
      () => OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 }),
      /owned by pid \d+/,
    );
    lock.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a stale lock is broken and taken over — silence is the evidence', () => {
  const dir = tempDir();
  try {
    const lockPath = join(dir, 'main.lock');
    const dead = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 });
    // Simulate a crashed owner: no release, the heartbeat long silent.
    const doc = readDoc(lockPath);
    writeFileSync(lockPath, JSON.stringify({ ...doc, heartbeat_at: doc.heartbeat_at - 60_000 }));
    const takeover = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000, staleMs: 30_000 });
    assert.equal(readDoc(lockPath).pid, process.pid);
    // The broken hand's release must refuse — the lock is the successor's
    // now, and a dead hand must not delete a living claim.
    assert.throws(() => dead.release(), /ownership moved to pid/);
    takeover.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the heartbeat rewrites the lock while held', async () => {
  const dir = tempDir();
  const lock = OwnershipLock.acquire(join(dir, 'main.lock'), { heartbeatMs: 5 });
  try {
    const lockPath = join(dir, 'main.lock');
    const before = readDoc(lockPath).heartbeat_at;
    const deadline = Date.now() + 2_000;
    while (readDoc(lockPath).heartbeat_at === before && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(readDoc(lockPath).heartbeat_at > before, 'heartbeat moved the timestamp');
  } finally {
    lock.release();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a hand-corrupted lock refuses with the teaching — no owner can be named', () => {
  const dir = tempDir();
  try {
    const lockPath = join(dir, 'main.lock');
    writeFileSync(lockPath, '{ half a thought');
    assert.throws(() => OwnershipLock.acquire(lockPath), /does not parse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
