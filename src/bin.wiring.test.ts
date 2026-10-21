import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Store } from "./db.ts";

/**
 * The seam-wiring rule (the security audit's emergent pattern, 2026-10-21):
 * the open seam is contract-tested on the lib side and unit-tested with
 * injected fakes on the server side — this file exercises the REAL bin, the
 * one place neither reaches. Finding 01 lived exactly here: server.ts passed
 * the readOnly decision to openStore and the bin dropped it, invisible to
 * every test that injects its own seam implementation.
 */
const bin = fileURLToPath(new URL("../bin/souvenance.js", import.meta.url));

/** A free port handed over by the OS (TOCTOU-raceable, fine in tests). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** Builds the fixture: a fresh main store, a downgraded aux store (schema 4),
 *  a current-schema aux store. */
function fixture(): { main: string; old: string; good: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-wiring-test-"));
  const main = join(dir, "main.db");
  const old = join(dir, "old.db");
  const good = join(dir, "good.db");
  for (const p of [main, old, good]) {
    const s = Store.open({ dbPath: p });
    s.close();
  }
  // Downgrade exactly like db.readonly.test.ts: schema_version keeps one row
  // per applied migration — a v4 store keeps rows 1..4.
  const raw = new DatabaseSync(old);
  raw.prepare("DELETE FROM schema_version WHERE version > 4").run();
  raw.close();
  return { main, old, good, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function start(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`timeout waiting for the server: ${out}`)), 10_000);
    child.stdout!.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      if (out.includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}): ${out}`));
    });
  });
}

test("wiring: the real bin serve passes the readOnly decision into the lib (ro mounts refuse and never migrate)", async () => {
  const fx = fixture();
  const port = await freePort();
  const child = spawn(process.execPath, [
    bin,
    "--db", fx.main,
    "serve",
    "--port", String(port),
    "--store", `oldmount=${fx.old}`,
    "--store", `good=${fx.good}`,
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  try {
    await start(child);

    // The ro-declared old-schema mount must be REFUSED at the lib floor:
    // a writable open would silently migrate it and the store would answer.
    const refused = await fetch(`http://127.0.0.1:${port}/oldmount/stats`);
    assert.equal(refused.status, 500, "the old-schema ro mount is refused");

    // THE discriminator: the mount's schema must be untouched.
    const raw = new DatabaseSync(fx.old);
    const row = raw
      .prepare("SELECT MAX(version) AS version FROM schema_version")
      .get() as { version: number };
    raw.close();
    assert.equal(row.version, 4, "the read-only mount must never be migrated through serve");

    // The real refusal text reaches the operator's log, not the client body.
    assert.match(stderr, /open it read-write once to migrate/);

    // A current-schema ro mount serves reads and blocks writes at the mount.
    const stats = await fetch(`http://127.0.0.1:${port}/good/stats`);
    assert.equal(stats.status, 200);
    const write = await fetch(`http://127.0.0.1:${port}/good/memories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "blocked by the ro floor" }),
    });
    assert.equal(write.status, 409, "writes on a ro mount stay blocked");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fx.cleanup();
  }
});

test("wiring: a CLI usage error prints one error line, exits 1, and closes the store", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-cli-fail-test-"));
  // merge with a single id fails in the switch — AFTER the store was opened,
  // so the finally block is the only thing standing between the error and an
  // unclosed WAL (security audit, issue 07).
  const result = spawnSync(process.execPath, [bin, "merge", "only-one-id", "--content", "x"], {
    cwd: dir,
    encoding: "utf8",
  });
  try {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^error: merge requires at least 2 ids/m);
    assert.doesNotMatch(result.stderr, /^    at /m, "a usage failure must not print a stack trace");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
