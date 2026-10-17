import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, type NetworkInterfaceInfo } from "node:os";
import { Store } from "./db.ts";
import { createApp, exposedAddresses, MAX_BODY_BYTES, MAX_LIMIT } from "./server.ts";

/** A temp store + app (local mode — caps are mode-independent). */
function tempApp(): { app: ReturnType<typeof createApp>; store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-caps-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  const app = createApp(store);
  return {
    app,
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
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

test("caps: declared content-length over the body cap -> 413, nothing read", async () => {
  const { app, cleanup } = tempApp();
  try {
    // A manually set content-length is preserved by the Request
    // constructor (the spec only appends it when absent).
    const res = await app.request(
      new Request("http://localhost/memories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(MAX_BODY_BYTES + 1),
        },
        body: JSON.stringify({ content: "tiny body, greedy declaration" }),
      }),
    );
    assert.equal(res.status, 413);
    const json: any = await res.json();
    assert.match(json.error, /1 MiB|1048576|exceeds/);
  } finally {
    cleanup();
  }
});

test("caps: a lying (or chunked) body is capped during the streamed read -> 413", async () => {
  const { app, cleanup } = tempApp();
  try {
    // Declares 10 bytes, ships > MAX_BODY_BYTES: the up-front check passes,
    // the stream budget is what stops it.
    const res = await app.request(
      new Request("http://localhost/memories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "10",
        },
        body: JSON.stringify({ content: "x".repeat(MAX_BODY_BYTES + 1024) }),
      }),
    );
    assert.equal(res.status, 413);
    const json: any = await res.json();
    assert.match(json.error, /cap/);
  } finally {
    cleanup();
  }
});

test("caps: a large-but-legal body stores normally", async () => {
  const { app, cleanup } = tempApp();
  try {
    const content = "# Big memory\n\n" + "paragraph ".repeat(20_000); // ~200 KB
    const { status, json } = await call(app, "POST", "/memories", { content });
    assert.equal(status, 201);
    assert.ok(json.id);
  } finally {
    cleanup();
  }
});

test("caps: ?limit over MAX_LIMIT -> 400 with the cap named", async () => {
  const { app, cleanup } = tempApp();
  try {
    const over = await call(app, "GET", `/memories?limit=${MAX_LIMIT + 1}`);
    assert.equal(over.status, 400);
    assert.match(over.json.error, /1000 cap/);
    const at = await call(app, "GET", `/memories?limit=${MAX_LIMIT}`);
    assert.equal(at.status, 200);
    const zero = await call(app, "GET", "/memories?limit=0");
    assert.equal(zero.status, 200);
  } finally {
    cleanup();
  }
});

test("caps: negative, float and non-integer limit/offset -> 400 (a negative LIMIT disables the SQL limit)", async () => {
  const { app, cleanup } = tempApp();
  try {
    for (const qs of ["limit=-1", "limit=1.5", "limit=abc", "offset=-3", "offset=1.5", "offset=xyz"]) {
      const { status, json } = await call(app, "GET", `/memories?${qs}`);
      assert.equal(status, 400, `?${qs} must be 400`);
      assert.match(json.error, /non-negative integer/);
    }
    const search = await call(app, "GET", "/search?q=tabs&limit=1001");
    assert.equal(search.status, 400);
  } finally {
    cleanup();
  }
});

test("caps: /recover limits are capped too", async () => {
  const { app, cleanup } = tempApp();
  try {
    for (const param of ["directives", "summaries"]) {
      const { status, json } = await call(app, "GET", `/recover?${param}=1001`);
      assert.equal(status, 400, `?${param} over the cap must be 400`);
      assert.match(json.error, /1000 cap/);
    }
    const ok = await call(app, "GET", "/recover?directives=2&summaries=1");
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.json.directives));
    assert.ok(Array.isArray(ok.json.summaries));
  } finally {
    cleanup();
  }
});

const v4 = (address: string, internal: boolean): NetworkInterfaceInfo => ({
  address,
  family: "IPv4",
  internal,
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: `${address}/24`,
});
const v6 = (address: string, internal: boolean, scopeid = 0): NetworkInterfaceInfo => ({
  address,
  family: "IPv6",
  internal,
  scopeid,
  netmask: "ffff:ffff:ffff:ffff::",
  mac: "00:00:00:00:00:00",
  cidr: `${address}/64`,
});

const IFACES: NodeJS.Dict<NetworkInterfaceInfo[]> = {
  lo: [v4("127.0.0.1", true), v6("::1", true)],
  eth0: [v4("192.168.1.42", false), v6("fe80::1", false, 3), v6("2a01:db8::1", false)],
  wlan0: [v4("192.168.1.42", false)],
  docker: [v4("172.17.0.1", false)],
};

test("exposure: loopback binds expose nothing", () => {
  assert.deepEqual(exposedAddresses("127.0.0.1", IFACES), []);
  assert.deepEqual(exposedAddresses("::1", IFACES), []);
  assert.deepEqual(exposedAddresses("localhost", IFACES), []);
});

test("exposure: a specific bind is itself", () => {
  assert.deepEqual(exposedAddresses("192.168.1.42", IFACES), ["192.168.1.42"]);
});

test("exposure: 0.0.0.0 resolves to the deduped non-internal IPv4s", () => {
  assert.deepEqual(exposedAddresses("0.0.0.0", IFACES), ["192.168.1.42", "172.17.0.1"]);
});

test("exposure: :: resolves to both families, without link-local or loopback", () => {
  assert.deepEqual(exposedAddresses("::", IFACES), ["192.168.1.42", "2a01:db8::1", "172.17.0.1"]);
});
