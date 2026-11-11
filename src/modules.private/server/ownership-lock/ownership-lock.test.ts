import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { OwnershipLock } from './ownership-lock.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-lock-test-'));
}

function readDoc(path: string): {
  pid: number;
  claim: string;
  acquired_at: number;
  heartbeat_at: number;
} {
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

test('verifyClaim reads the document — ours and beating is true, stale or foreign is false', () => {
  const dir = tempDir();
  try {
    const lockPath = join(dir, 'main.lock');
    const lock = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 });
    // The heartbeat's own face: the claim just wrote it — ours and fresh.
    assert.equal(lock.verifyClaim(), true);
    // The staleness case by direct means: the document's heartbeat_at
    // pinned to the past — no clock manipulated, the silence the
    // module's own law reads as a dead owner.
    const doc = readDoc(lockPath);
    writeFileSync(
      lockPath,
      JSON.stringify({ ...doc, claim: doc.claim, heartbeat_at: doc.heartbeat_at - 60_000 }),
    );
    assert.equal(lock.verifyClaim(), false, 'a silent heartbeat is not ours to settle behind');
    // The takeover's shape, fresh: the claim identity is foreign even
    // though the heartbeat beats — a successor's document is not ours.
    const takeover = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 });
    writeFileSync(
      lockPath,
      JSON.stringify({
        ...readDoc(lockPath),
        claim: 'a hand rewrote the successor',
        heartbeat_at: Date.now(),
      }),
    );
    assert.equal(takeover.verifyClaim(), false, 'a foreign claim is not ours to settle behind');
    // A foreign document under either hand is the takeover's own law:
    // the release refuses rather than delete the successor's claim —
    // and the refusal still clears the refusing hand's heartbeat
    // timer: an unclaimed lock never beats again, or its orphan timer
    // would outlive the test's directory and read a deleted document
    // uncaught.
    assert.throws(() => lock.release(), /ownership moved to pid/);
    assert.throws(() => takeover.release(), /ownership moved to pid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyClaim reads a malformed document as unverified — null, string, array, no throw', () => {
  const dir = tempDir();
  try {
    const lockPath = join(dir, 'main.lock');
    const lock = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 });
    const doc = readDoc(lockPath);
    // `null` is legal JSON: the read and the parse both succeed, the
    // document names no owner — an unverified claim, false, never a
    // throw past the witness.
    writeFileSync(lockPath, 'null');
    assert.equal(lock.verifyClaim(), false);
    // The rest of the malformed family, the same one spelling: a
    // string, an array — shapes distinguished, never coerced.
    writeFileSync(lockPath, '"a hand wrote a string"');
    assert.equal(lock.verifyClaim(), false);
    writeFileSync(lockPath, '[]');
    assert.equal(lock.verifyClaim(), false);
    // The claim's own document restored, the claim never moved: the
    // healthy shape reads true again.
    writeFileSync(lockPath, JSON.stringify(doc));
    assert.equal(lock.verifyClaim(), true);
    lock.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyClaim without a document is false — an unreadable lock is no settle\u2019s witness', () => {
  const dir = tempDir();
  try {
    const lockPath = join(dir, 'main.lock');
    const lock = OwnershipLock.acquire(lockPath, { heartbeatMs: 60_000 });
    rmSync(lockPath, { force: true });
    assert.equal(lock.verifyClaim(), false);
    // The release's own law: no readable document, no release — the
    // ENOENT rides raw, and the caller of a vanished claim settles.
    assert.throws(() => lock.release(), /ENOENT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
