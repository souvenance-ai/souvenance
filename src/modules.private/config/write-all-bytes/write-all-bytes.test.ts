/**
 * The write loop's pins: a real descriptor round-trips the content
 * whole, a short-answering `write` walks the payload by offset until its
 * last byte lands, and an answer that stops making progress refuses
 * rather than spin forever (a truncated file must never pass as whole).
 */
import assert from 'node:assert/strict';
import { chmodSync, closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { writeAllBytes } from './write-all-bytes.ts';

const dirs: string[] = [];

/** One temp workspace per test, cleaned at the suite's end. */
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-write-all-test-'));
  dirs.push(dir);
  return dir;
}

test.afterEach(() => {
  for (const dir of dirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the write lands whole on a real descriptor — the content round-trips', () => {
  const dir = tempDir();
  const payload =
    'the config\u2019s whole document, multibyte \u00e9\u2014\u2014, {"tokens": []}\n';
  const fd = openSync(join(dir, 'scratch'), 'w', 0o600);
  try {
    writeAllBytes(fd, payload);
  } finally {
    closeSync(fd);
  }
  const text = readFileSync(join(dir, 'scratch'), 'utf8');
  assert.equal(Buffer.byteLength(text, 'utf8'), Buffer.byteLength(payload, 'utf8'));
  assert.equal(text, payload);
});

test('a short-answering write loops by offset until the last byte lands', () => {
  const payload =
    'the whole document, answered in shrinking pieces until every byte lands \u00e9\n';
  const landed: Buffer[] = [];
  const offsets: number[] = [];
  let calls = 0;
  writeAllBytes(-1, payload, (buffer, offset) => {
    calls += 1;
    const at = offset ?? 0;
    offsets.push(at);
    // The first two answers are short on purpose; the last answers the rest.
    const written = calls <= 2 ? Math.max(1, Math.floor(buffer.length / 4)) : buffer.length - at;
    landed.push(Buffer.from(buffer.subarray(at, at + written)));
    return written;
  });
  assert.ok(calls > 1, 'the loop replayed the write');
  assert.equal(offsets[0], 0);
  assert.ok(
    offsets.every((at, i) => i === 0 || at > offsets[i - 1]),
    'the offsets walk forward',
  );
  assert.equal(Buffer.concat(landed).toString('utf8'), payload);
});

test('a write that answers no progress refuses rather than spinning', () => {
  assert.throws(
    () => writeAllBytes(-1, 'nothing ever lands', () => 0),
    (err: unknown) => err instanceof Error && /no progress/.test((err as Error).message),
  );
});
