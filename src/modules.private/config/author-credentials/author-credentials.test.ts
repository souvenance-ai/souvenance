import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { CredentialFamilies } from '../config.ts';
import { ConfigError } from '../config.ts';
import { CredentialDriftError, authorCredentials } from './author-credentials.ts';

const SECRET = `souv-${'a'.repeat(32)}`;
const OTHER = `souv-${'b'.repeat(32)}`;
const THIRD = `souv-${'f'.repeat(32)}`;

const EXPECTED: CredentialFamilies = {
  tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
  management: [{ agent: 'ops', secret: OTHER }],
};

const dirs: string[] = [];

/** One temp workspace per test, cleaned at the suite's end. */
function tempWorkspace(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-author-test-'));
  dirs.push(dir);
  const path = join(dir, 'config.json');
  if (config !== undefined) writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}

test.afterEach(() => {
  for (const dir of dirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the surgery splices the credential keys and rides the sibling keys verbatim', () => {
  const path = tempWorkspace({
    port: 4040,
    host: '127.0.0.1',
    logRequests: true,
    tokens: EXPECTED.tokens,
    management: [EXPECTED.management[0]],
  });
  const next: CredentialFamilies = {
    tokens: [
      ...EXPECTED.tokens,
      { agent: 'archiviste', secret: OTHER, store: 'fork-of-euria', mode: 'ro' },
    ],
    management: [],
  };
  authorCredentials(path, EXPECTED, next);
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  assert.equal(doc['port'], 4040);
  assert.equal(doc['host'], '127.0.0.1');
  assert.equal(doc['logRequests'], true);
  assert.deepEqual(doc['tokens'], next.tokens);
  assert.deepEqual(doc['management'], []);
});

test('the document is re-authored whole: two-space indent, one trailing newline', () => {
  const path = tempWorkspace({ tokens: [], management: [] });
  authorCredentials(path, { tokens: [], management: [] }, EXPECTED);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('    "agent": "atlas"'));
});

test('the write lands at 0600 - an existing looser file is tightened on sight', () => {
  const path = tempWorkspace({ tokens: [], management: [] });
  chmodSync(path, 0o644);
  assert.equal(statSync(path).mode & 0o777, 0o644);
  authorCredentials(path, { tokens: [], management: [] }, EXPECTED);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('the missing file with empty expected families is the cold host\u2019s first creation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-author-test-'));
  dirs.push(dir);
  const path = join(dir, 'nested', 'config.json');
  authorCredentials(path, { tokens: [], management: [] }, EXPECTED);
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  assert.deepEqual(doc['tokens'], EXPECTED.tokens);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('a vanished file with live rows refuses as drift - a hand edited the credentials while running', () => {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-author-test-'));
  dirs.push(dir);
  const path = join(dir, 'config.json');
  assert.throws(
    () => authorCredentials(path, EXPECTED, EXPECTED),
    (err: unknown) => err instanceof CredentialDriftError && /drifted/.test((err as Error).message),
  );
  assert.ok(!existsSync(path));
});

test('hand-edited rows while running refuse as drift - the file survives byte for byte', () => {
  const path = tempWorkspace({
    tokens: [{ agent: 'other', secret: OTHER, store: 'main', mode: 'ro' }],
    management: [],
  });
  const before = readFileSync(path, 'utf8');
  assert.throws(
    () => authorCredentials(path, EXPECTED, EXPECTED),
    (err: unknown) =>
      err instanceof CredentialDriftError && /restart to apply them/.test((err as Error).message),
  );
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('a credential key held as null while the rows are empty refuses as drift, the file untouched', () => {
  // The rows would coerce to an empty family and a mint would silently
  // overwrite the hand's shape: the key PRESENT but not an array is the
  // hand edit itself, refused as drift, the file kept byte for byte.
  const path = tempWorkspace({ tokens: null, management: [] });
  const before = readFileSync(path, 'utf8');
  assert.throws(
    () => authorCredentials(path, { tokens: [], management: [] }, EXPECTED),
    (err: unknown) =>
      err instanceof CredentialDriftError &&
      /"tokens"/.test((err as Error).message) &&
      /restart to apply them/.test((err as Error).message),
  );
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('a credential key held as an object while the rows are empty refuses as drift', () => {
  const path = tempWorkspace({ tokens: [], management: {} });
  const before = readFileSync(path, 'utf8');
  assert.throws(
    () => authorCredentials(path, { tokens: [], management: [] }, EXPECTED),
    (err: unknown) =>
      err instanceof CredentialDriftError &&
      /"management"/.test((err as Error).message) &&
      /restart to apply them/.test((err as Error).message),
  );
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('a document that is not a config object refuses the surgery - a sick file, never drift', () => {
  for (const raw of ['[]', 'null', '5']) {
    const path = tempWorkspace(undefined);
    writeFileSync(path, raw);
    const before = readFileSync(path, 'utf8');
    assert.throws(
      () => authorCredentials(path, { tokens: [], management: [] }, EXPECTED),
      (err: unknown) =>
        err instanceof ConfigError &&
        err instanceof CredentialDriftError === false &&
        /config object/.test(err.message),
    );
    assert.equal(readFileSync(path, 'utf8'), before);
  }
});

test('the drift comparison tolerates row order and row-key order - no false drift', () => {
  const path = tempWorkspace({
    management: [{ secret: OTHER, agent: 'ops' }],
    tokens: [
      { mode: 'rw', store: 'main', secret: SECRET, agent: 'atlas' },
      { agent: 'scribe', store: 'main', mode: 'ro', secret: THIRD },
    ],
  });
  const expected: CredentialFamilies = {
    tokens: [
      { agent: 'scribe', secret: THIRD, store: 'main', mode: 'ro' },
      { agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' },
    ],
    management: [{ agent: 'ops', secret: OTHER }],
  };
  authorCredentials(path, expected, {
    tokens: [
      ...expected.tokens,
      { agent: 'new', secret: `souv-${'e'.repeat(32)}`, store: 'main', mode: 'ro' },
    ],
    management: expected.management,
  });
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  assert.equal((doc['tokens'] as unknown[]).length, 3);
});

test('a file that no longer parses refuses the surgery, quoting no file text', () => {
  const path = tempWorkspace(undefined);
  writeFileSync(path, `{"tokens": [{"secret": "${SECRET}"`);
  const before = readFileSync(path, 'utf8');
  assert.throws(
    () => authorCredentials(path, EXPECTED, EXPECTED),
    (err: unknown) =>
      err instanceof ConfigError &&
      /does not parse/.test((err as Error).message) &&
      !String(err).includes(SECRET),
  );
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('the spliced document breaking the grammar refuses the surgery, the file untouched', () => {
  // A hand broke a sibling key while the server ran (the boot parsed a
  // healthy file; the mint in flight re-authors it whole): the surgery
  // judges the FINAL document and refuses before a byte lands.
  const path = tempWorkspace({
    logRequests: 5,
    tokens: EXPECTED.tokens,
    management: [EXPECTED.management[0]],
  });
  const before = readFileSync(path, 'utf8');
  const next: CredentialFamilies = {
    tokens: [...EXPECTED.tokens],
    management: [EXPECTED.management[0]],
  };
  assert.throws(
    () => authorCredentials(path, EXPECTED, next),
    (err: unknown) =>
      err instanceof ConfigError && /breaks the grammar/.test((err as Error).message),
  );
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('a failed write leaves the file and the directory clean of scratch', () => {
  if (process.getuid?.() === 0) return; // root writes through read-only dirs
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-author-test-'));
  dirs.push(dir);
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify({ tokens: [], management: [] }, null, 2));
  chmodSync(dir, 0o500);
  try {
    assert.throws(
      () => authorCredentials(path, { tokens: [], management: [] }, EXPECTED),
      (err: unknown) => err instanceof ConfigError && /failed/.test((err as Error).message),
    );
  } finally {
    chmodSync(dir, 0o700);
  }
  assert.deepEqual(readdirSync(dir).sort(), ['config.json']);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8') as string), {
    tokens: [],
    management: [],
  });
});
