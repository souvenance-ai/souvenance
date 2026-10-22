import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";

const SKIP_WIN = process.platform === "win32";

function tempStorePath(name = "memory.db"): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-perms-test-"));
  return {
    dbPath: join(dir, name),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const mode = (path: string): number => statSync(path).mode & 0o777;

test("permissions: a rw open tightens the store file to owner-only", { skip: SKIP_WIN }, () => {
  const { dbPath, cleanup } = tempStorePath();
  try {
    const store = Store.open({ dbPath });
    try {
      store.store("the identity lives here");
      assert.equal(mode(dbPath), 0o600, "a fresh store is 0600 at open");
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});

test("permissions: WAL sidecars are tightened alongside the db while writes run", { skip: SKIP_WIN }, () => {
  const { dbPath, cleanup } = tempStorePath();
  try {
    const store = Store.open({ dbPath });
    try {
      store.store("a write to force the WAL");
      for (const p of [`${dbPath}-wal`, `${dbPath}-shm`]) {
        if (existsSync(p)) {
          assert.equal(mode(p), 0o600, `sidecar ${p} tightened`);
        }
      }
    } finally {
      store.close();
    }
  } finally {
    cleanup();
  }
});

test("permissions: a reopened store loosened to 0644 is tightened back", { skip: SKIP_WIN }, () => {
  const { dbPath, cleanup } = tempStorePath();
  try {
    const first = Store.open({ dbPath });
    first.close();
    chmodSync(dbPath, 0o644);
    assert.equal(mode(dbPath), 0o644, "precondition: loosened while closed");
    const second = Store.open({ dbPath });
    try {
      assert.equal(mode(dbPath), 0o600, "reopening rw re-tightens");
    } finally {
      second.close();
    }
  } finally {
    cleanup();
  }
});

test("permissions: a fork target lands owner-only", { skip: SKIP_WIN }, () => {
  const { dbPath, cleanup } = tempStorePath("parent.db");
  const target = { dbPath: "", cleanup: () => {} };
  try {
    const store = Store.open({ dbPath });
    try {
      store.store("fork me");
      const fork = tempStorePath("fork.db");
      target.dbPath = fork.dbPath;
      target.cleanup = fork.cleanup;
      store.fork(fork.dbPath);
      assert.equal(mode(fork.dbPath), 0o600, "fork copy tightened");
    } finally {
      store.close();
    }
  } finally {
    cleanup();
    target.cleanup();
  }
});

test("doctor: file_permissions reports a loosened store below owner-only", { skip: SKIP_WIN }, () => {
  const { dbPath, cleanup } = tempStorePath();
  try {
    const store = Store.open({ dbPath });
    try {
      store.store("reported, not tightened silently");
      chmodSync(dbPath, 0o644);
      const report = store.doctor();
      const finding = report.findings.find((f) => f.check === "file_permissions");
      assert.ok(finding, "the loosened store is reported");
      assert.match(finding.hint, /chmod 600/);
    } finally {
      // restore before close so nothing else trips on the mode
      chmodSync(dbPath, 0o600);
      store.close();
    }
  } finally {
    cleanup();
  }
});
