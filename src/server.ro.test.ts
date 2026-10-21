import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";
import { createApp, statusFor } from "./server.ts";

/**
 * The server consumes the lib readonly mode (decision 675f18a8): a
 * ro-declared auxiliary mount in LOCAL mode opens its store readOnly=true
 * at the lib level — the 409 middleware stays as the HTTP face, the lib
 * guard is the floor. In token mode mounts open writable and the per-token
 * auth layer governs (increment 4 unchanged).
 */

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "souvenance-server-ro-"));
}

function seededPath(): { path: string; cleanup: (dir?: string) => void } {
  const dir = tempDir();
  const path = join(dir, "source.db");
  const store = Store.open({ dbPath: path });
  store.store("a memory about walrus");
  store.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

test("ro mounts open lib-readonly, rw mounts stay writable (local mode)", async () => {
  const ro = seededPath();
  const rwDir = tempDir();
  const rootDir = tempDir();
  try {
    const openings: Array<{ dbPath: string; readOnly: boolean }> = [];
    const root = Store.open({ dbPath: join(rootDir, "root.db") });
    const app = createApp(root, {
      stores: [
        { name: "ro", dbPath: ro.path, mode: "ro" },
        { name: "rw", dbPath: join(rwDir, "aux.db"), mode: "rw" },
      ],
      openStore: (dbPath, readOnly) => {
        openings.push({ dbPath, readOnly });
        return Store.open({ dbPath, readOnly });
      },
    });
    // One request per mount forces the lazy opens.
    await call(app, "GET", "/ro/search?q=walrus");
    await call(app, "GET", "/rw/search?q=walrus");
    assert.deepEqual(openings, [
      { dbPath: ro.path, readOnly: true },
      { dbPath: join(rwDir, "aux.db"), readOnly: false },
    ]);
    root.close();
  } finally {
    rmSync(rwDir, { recursive: true, force: true });
    ro.cleanup();
  }
});

test("a ro mount serves reads and still 409s writes (the middleware face)", async () => {
  const ro = seededPath();
  const rootDir = tempDir();
  try {
    const root = Store.open({ dbPath: join(rootDir, "root.db") });
    const app = createApp(root, {
      stores: [{ name: "ro", dbPath: ro.path, mode: "ro" }],
    });
    const read = await call(app, "GET", "/ro/search?q=walrus");
    assert.equal(read.status, 200);
    assert.equal(read.json[0].content, "a memory about walrus");
    const write = await call(app, "POST", "/ro/memories", { content: "x" });
    assert.equal(write.status, 409);
    assert.match(write.json.error, /read-only/);
    root.close();
  } finally {
    ro.cleanup();
  }
});

test("statusFor maps the lib readonly refusal to 409", () => {
  assert.equal(
    statusFor(new Error("store is read-only (opened with readOnly: true); writes are refused")),
    409,
  );
});
