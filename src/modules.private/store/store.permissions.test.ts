import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { Store } from './store.ts';

const SKIP_WINDOWS = process.platform === 'win32';

function tempStorePath(name = 'memory.db'): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-perms-test-'));
  return {
    dbPath: join(dir, name),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const mode = (path: string): number => statSync(path).mode & 0o777;

test(
  'permissions: a read-write open tightens the store file to owner-only',
  { skip: SKIP_WINDOWS },
  () => {
    const { dbPath, cleanup } = tempStorePath();
    try {
      const store = Store.open({ dbPath });
      try {
        store.store('the identity lives here');
        assert.equal(mode(dbPath), 0o600, 'a fresh store is 0600 at open');
      } finally {
        store.close();
      }
    } finally {
      cleanup();
    }
  },
);

test(
  'permissions: WAL sidecars are tightened alongside the store while writes run',
  { skip: SKIP_WINDOWS },
  () => {
    const { dbPath, cleanup } = tempStorePath();
    try {
      const store = Store.open({ dbPath });
      try {
        store.store('a write to force the WAL');
        for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
          if (existsSync(sidecar)) {
            assert.equal(mode(sidecar), 0o600, `sidecar ${sidecar} tightened`);
          }
        }
      } finally {
        store.close();
      }
    } finally {
      cleanup();
    }
  },
);

test(
  'permissions: a reopened store loosened to 0644 is tightened back',
  { skip: SKIP_WINDOWS },
  () => {
    const { dbPath, cleanup } = tempStorePath();
    try {
      const first = Store.open({ dbPath });
      first.close();
      chmodSync(dbPath, 0o644);
      assert.equal(mode(dbPath), 0o644, 'precondition: loosened while closed');
      const second = Store.open({ dbPath });
      try {
        assert.equal(mode(dbPath), 0o600, 'reopening read-write re-tightens');
      } finally {
        second.close();
      }
    } finally {
      cleanup();
    }
  },
);
