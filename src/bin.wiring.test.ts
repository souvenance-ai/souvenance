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

test("wiring: the real bin unlinks — removes, then refuses an ambiguous pair with exit 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-cli-unlink-test-"));
  try {
    const dbPath = join(dir, "memory.db");
    const s = Store.open({ dbPath });
    const a = s.store("memory alpha");
    const b = s.store("memory beta");
    s.close();

    const link = spawnSync(process.execPath, [bin, "--db", dbPath, "link", a, b, "--kind", "references"], {
      encoding: "utf8",
    });
    assert.equal(link.status, 0);
    assert.equal(link.stdout.trim(), "linked");

    // One edge on the pair: kind-less unlink removes it.
    const unlink = spawnSync(process.execPath, [bin, "--db", dbPath, "unlink", a, b], {
      encoding: "utf8",
    });
    assert.equal(unlink.status, 0);
    assert.equal(unlink.stdout.trim(), "unlinked");

    // Two kinds on the same pair: exit 1, the candidates on stderr, no stack.
    spawnSync(process.execPath, [bin, "--db", dbPath, "link", a, b, "--kind", "references"], { encoding: "utf8" });
    spawnSync(process.execPath, [bin, "--db", dbPath, "link", a, b, "--kind", "extends"], { encoding: "utf8" });
    const ambiguous = spawnSync(process.execPath, [bin, "--db", dbPath, "unlink", a, b], {
      encoding: "utf8",
    });
    assert.equal(ambiguous.status, 1);
    assert.match(ambiguous.stderr, /^error: ambiguous: 2 edges between .* and .*/m);
    assert.match(ambiguous.stderr, /pass --kind: extends, references/);
    assert.doesNotMatch(ambiguous.stderr, /^    at /m, "a refusal must not print a stack trace");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wiring: the real bin stores one-gesture relations — and refuses a malformed id at the flag", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-cli-relations-test-"));
  try {
    const dbPath = join(dir, "memory.db");
    const s = Store.open({ dbPath });
    const target = s.store("the referenced decision", { metadata: { kind: "decision" } });
    s.close();

    // Two --relation flags: both outgoing edges land in the same call.
    const stored = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "store", "one gesture, written once",
        "--relation", `references:${target}`, "--relation", `extends:${target}`],
      { encoding: "utf8" },
    );
    assert.equal(stored.status, 0);
    const id = stored.stdout.trim();

    const verify = spawnSync(process.execPath, [bin, "--db", dbPath, "relations", id], { encoding: "utf8" });
    assert.equal(verify.status, 0);
    const rels = JSON.parse(verify.stdout);
    assert.equal(rels.length, 2);
    assert.deepEqual(rels.map((r: { kind: string }) => r.kind).sort(), ["extends", "references"]);
    assert.ok(rels.every((r: { to_id: string }) => r.to_id === target));

    // Supersede: the relations attach to the NEW memory...
    const superseded = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "supersede", id, "--content", "revised, linked in one gesture",
        "--relation", `references:${target}`],
      { encoding: "utf8" },
    );
    assert.equal(superseded.status, 0);
    const newId = superseded.stdout.trim();
    const newRels = JSON.parse(
      spawnSync(process.execPath, [bin, "--db", dbPath, "relations", newId, "--direction", "out"], { encoding: "utf8" }).stdout,
    );
    assert.equal(newRels.length, 1);
    assert.equal(newRels[0].kind, "references");
    // ...and the old memory keeps its history: the two authored edges AND
    // the new supersedes bridge (addition-only — supersede never cascades).
    const oldRels = JSON.parse(
      spawnSync(process.execPath, [bin, "--db", dbPath, "relations", id], { encoding: "utf8" }).stdout,
    );
    assert.equal(oldRels.length, 3);
    const bridge = oldRels.find((r: { kind: string }) => r.kind === "supersedes");
    assert.ok(bridge, "the supersedes bridge is there");
    assert.equal(bridge.to_id, newId);

    // A PLAIN supersede (no --relation) inherits the head's outgoing edges
    // (ticket 03 ruling): the successor claims the source's claims.
    const v2 = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "supersede", newId, "--content", "v2 plain, edges inherited"],
      { encoding: "utf8" },
    );
    assert.equal(v2.status, 0);
    const v3id = v2.stdout.trim();
    const v3 = JSON.parse(
      spawnSync(process.execPath, [bin, "--db", dbPath, "relations", v3id, "--direction", "out"], { encoding: "utf8" }).stdout,
    );
    assert.deepEqual(v3.map((r: { kind: string }) => r.kind).sort(), ["references"]);
    assert.equal(v3[0].to_id, target);

    // Refuse-don't-hide: a truncated uuid is refused AT THE FLAG.
    const prefix = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "store", "prefix attempt", "--relation", `references:${target.slice(0, 8)}`],
      { encoding: "utf8" },
    );
    assert.equal(prefix.status, 1);
    assert.match(prefix.stderr, /is not a full uuid/);
    assert.doesNotMatch(prefix.stderr, /^    at /m, "a refusal must not print a stack trace");

    // Missing colon: the syntax error names the expected shape.
    const noColon = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "store", "syntax attempt", "--relation", "references"],
      { encoding: "utf8" },
    );
    assert.equal(noColon.status, 1);
    assert.match(noColon.stderr, /expected <kind>:<uuid>/);

    // A well-formed uuid that is not in the store: the lib's precise error.
    const ghost = "00000000-0000-4000-8000-000000000006";
    const missing = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "store", "ghost attempt", "--relation", `references:${ghost}`],
      { encoding: "utf8" },
    );
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, new RegExp(`memory not found: ${ghost}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wiring: the real bin recover — the ritual in one call, summaries drilled-in", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-cli-recover-test-"));
  try {
    const dbPath = join(dir, "memory.db");
    const s = Store.open({ dbPath });
    const decision = s.store("the arc decision", { metadata: { kind: "decision" } });
    s.close();

    // The agent's one-gesture summary: stored AND linked in the same call.
    const summary = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "store", "# Summary: the arc",
        "--metadata", '{"kind":"summary"}', "--relation", `references:${decision}`],
      { encoding: "utf8" },
    );
    assert.equal(summary.status, 0);

    const rec = spawnSync(process.execPath, [bin, "--db", dbPath, "recover"], { encoding: "utf8" });
    assert.equal(rec.status, 0);
    const ritual = JSON.parse(rec.stdout);
    assert.equal(ritual.summaries.length, 1);
    assert.equal(ritual.summaries[0].relations.out.length, 1);
    assert.equal(ritual.summaries[0].relations.out[0].kind, "references");
    assert.equal(ritual.summaries[0].relations.out[0].to_id, decision);
    assert.deepEqual(ritual.summaries[0].relations.in, []);
    // The directives and objectives blocks stay their list selves.
    assert.deepEqual(ritual.directives, []);
    assert.deepEqual(ritual.objectives, []);
    assert.equal(ritual.stats.edges, 1);

    // The limit flags bound the blocks.
    const zero = spawnSync(
      process.execPath,
      [bin, "--db", dbPath, "recover", "--summaries", "0"],
      { encoding: "utf8" },
    );
    assert.equal(zero.status, 0);
    assert.deepEqual(JSON.parse(zero.stdout).summaries, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
