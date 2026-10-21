import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";
import {
  createApp,
  isLoopbackHost,
  parseTokenSpec,
  type DeclaredStore,
  type TokenGrant,
} from "./server.ts";

/** A temp store + app, optionally in token mode with declared aux stores. */
function tempApp(opts: { stores?: DeclaredStore[]; tokens?: TokenGrant[]; host?: string } = {}): {
  app: ReturnType<typeof createApp>;
  store: Store;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-auth-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  const app = createApp(store, {
    ...(opts.stores !== undefined ? { stores: opts.stores } : {}),
    ...(opts.tokens !== undefined ? { tokens: opts.tokens } : {}),
    ...(opts.host !== undefined ? { host: opts.host } : {}),
  });
  return {
    app,
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Runs a request with an optional Authorization header; parses JSON bodies. */
async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
  bearer?: string,
): Promise<{ status: number; json: any; text: string }> {
  const res = await app.request(path, {
    method,
    headers: {
      ...(bearer !== undefined ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, text };
}

const SECRET = "0123456789abcdef0123456789abcdef";
const SECRET_AUX = "fedcba9876543210fedcba9876543210";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("parseTokenSpec: defaults, @store, modifiers in any order", () => {
  assert.deepEqual(parseTokenSpec(`val=${SECRET}`), {
    agent: "val",
    token: SECRET,
    store: "root",
    mode: "ro",
    where: false,
  });
  assert.equal(parseTokenSpec(`val=${SECRET}@notes`).store, "notes");
  assert.equal(parseTokenSpec(`val=${SECRET}@notes:rw`).mode, "rw");
  assert.equal(parseTokenSpec(`val=${SECRET}:rw:where`).mode, "rw");
  assert.equal(parseTokenSpec(`val=${SECRET}:where:rw`).mode, "rw");
  assert.equal(parseTokenSpec(`val=${SECRET}:where`).where, true);
  assert.equal(parseTokenSpec(`val=${SECRET}@root:rw`).store, "root");
});

test("parseTokenSpec: rejects malformed specs", () => {
  assert.throws(() => parseTokenSpec("noequals"), /--token expects/);
  assert.throws(() => parseTokenSpec(`Val=${SECRET}`), /invalid agent name/);
  assert.throws(() => parseTokenSpec("val="), /the secret needs/);
  assert.throws(() => parseTokenSpec("val=short"), /the secret needs/);
  assert.throws(() => parseTokenSpec(`val=${SECRET}@`), /requires a store name/);
  assert.throws(() => parseTokenSpec(`val=${SECRET}:rw:BAD`), /the secret needs/);
  assert.throws(() => parseTokenSpec("val=abcdef0123456789:extra"), /@' or ':'/);
  // '@' splits secret from store at its FIRST occurrence; a second one
  // lands in the store segment and is rejected by the store rule.
  assert.throws(() => parseTokenSpec("val=abc@def@notes"), /invalid grant store/);
});

test("isLoopbackHost: the local trust zone", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
  assert.equal(isLoopbackHost("192.168.1.10"), false);
});

test("trust boundary: non-loopback host without tokens refuses to start", () => {
  assert.throws(() => tempApp({ host: "0.0.0.0" }), /not loopback.*open identity/);
});

test("trust boundary: non-loopback host with tokens starts and serves", async () => {
  const { app, cleanup } = tempApp({
    host: "0.0.0.0",
    tokens: [parseTokenSpec(`val=${SECRET}`)],
  });
  try {
    assert.equal((await call(app, "GET", "/", undefined, SECRET)).status, 200);
    assert.equal((await call(app, "GET", "/")).status, 401);
  } finally {
    cleanup();
  }
  const legacy = tempApp();
  legacy.cleanup();
});

test("token mode: anonymous and malformed requests -> 401", async () => {
  const { app, cleanup } = tempApp({ tokens: [parseTokenSpec(`val=${SECRET}`)] });
  try {
    assert.equal((await call(app, "GET", "/memories")).status, 401);
    assert.equal((await call(app, "GET", "/memories", undefined, "wrong-token-value-0000")).status, 401);
    assert.equal((await call(app, "GET", "/memories", undefined, `${SECRET} extra`)).status, 401);
    // Unknown paths authenticate first (no existence leak).
    assert.equal((await call(app, "GET", "/nothing", undefined, "wrong-token-value-0000")).status, 401);
  } finally {
    cleanup();
  }
});

test("token mode: granted reads work end-to-end", async () => {
  const { app, store, cleanup } = tempApp({ tokens: [parseTokenSpec(`val=${SECRET}`)] });
  try {
    const id = store.store("hello remote", { metadata: { kind: "note", tags: ["auth"] } });
    const listed = await call(app, "GET", "/memories", undefined, SECRET);
    assert.equal(listed.status, 200);
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].id, id);
    const got = await call(app, "GET", `/memories/${id}`, undefined, SECRET);
    assert.equal(got.status, 200);
    assert.equal(got.json.content, "hello remote");
    assert.equal((await call(app, "GET", "/stats", undefined, SECRET)).status, 200);
    assert.equal((await call(app, "GET", "/recover", undefined, SECRET)).status, 200);
  } finally {
    cleanup();
  }
});

test("token mode: writes need :rw (409), granted rw writes succeed", async () => {
  const { app, cleanup } = tempApp({ tokens: [parseTokenSpec(`val=${SECRET}`)] });
  try {
    const blocked = await call(app, "POST", "/memories", { content: "no" }, SECRET);
    assert.equal(blocked.status, 409);
    assert.match(blocked.json.error, /read-only.*opt in with :rw/);
    assert.equal((await call(app, "PATCH", "/memories/x", { weight: 0.5 }, SECRET)).status, 409);
    assert.equal((await call(app, "POST", "/doctor", { fix: true }, SECRET)).status, 409);
  } finally {
    cleanup();
  }
  const { app: rwApp, cleanup: rwCleanup } = tempApp({
    tokens: [parseTokenSpec(`val=${SECRET}:rw`)],
  });
  try {
    const made = await call(rwApp, "POST", "/memories", { content: "yes" }, SECRET);
    assert.equal(made.status, 201);
    assert.match(made.json.id, UUID_RE);
  } finally {
    rwCleanup();
  }
});

test("token mode: scoping — 403 on stores the token is not granted", async () => {
  // The mount for 'cold' is never opened on a 403: the guard fires before
  // the handler resolves the store — a nonexistent path proves no side effect.
  const { app, cleanup } = tempApp({
    stores: [{ name: "cold", dbPath: "/tmp/souvenance-auth-test-never-opened.db", mode: "ro" }],
    tokens: [parseTokenSpec(`val=${SECRET}`)],
  });
  try {
    const hit = await call(app, "GET", "/cold/memories", undefined, SECRET);
    assert.equal(hit.status, 403);
    assert.match(hit.json.error, /granted store 'root', not 'cold'/);
  } finally {
    cleanup();
  }

  const dir = mkdtempSync(join(tmpdir(), "souvenance-auth-test-"));
  try {
    const { app: auxApp, cleanup: auxCleanup } = tempApp({
      stores: [{ name: "cold", dbPath: join(dir, "aux.db"), mode: "ro" }],
      tokens: [parseTokenSpec(`val=${SECRET_AUX}@cold`)],
    });
    try {
      assert.equal((await call(auxApp, "GET", "/memories", undefined, SECRET_AUX)).status, 403);
      // ro token on a store it IS granted still lists.
      const listed = await call(auxApp, "GET", "/cold/memories", undefined, SECRET_AUX);
      assert.equal(listed.status, 200);
      assert.deepEqual(listed.json, []);
    } finally {
      auxCleanup();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("token mode: raw where is local-only (400) unless the token opts in", async () => {
  const { app, store, cleanup } = tempApp({ tokens: [parseTokenSpec(`val=${SECRET}`)] });
  try {
    store.store("d", { metadata: { kind: "directive" } });
    const blocked = await call(app, "GET", "/memories?where=1", undefined, SECRET);
    assert.equal(blocked.status, 400);
    assert.match(blocked.json.error, /local-only.*kind\/tag.*:where/);
    assert.equal((await call(app, "GET", "/search?q=d&where=1", undefined, SECRET)).status, 400);
    assert.equal((await call(app, "GET", "/tags?where=1", undefined, SECRET)).status, 400);
    // The structured path stays open to every token.
    const structured = await call(app, "GET", "/memories?kind=directive", undefined, SECRET);
    assert.equal(structured.status, 200);
    assert.equal(structured.json.length, 1);
  } finally {
    cleanup();
  }
  const { app: optApp, store: optStore, cleanup: optCleanup } = tempApp({
    tokens: [parseTokenSpec(`val=${SECRET}:where`)],
  });
  try {
    optStore.store("s", { metadata: { kind: "note" } });
    const ok = await call(
      optApp,
      "GET",
      "/memories?where=" + encodeURIComponent("metadata->>'$.kind' = 'note'"),
      undefined,
      SECRET,
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.json.length, 1);
  } finally {
    optCleanup();
  }
});

test("structured filters: kind repeats OR (scalar field), tag repeats AND (array membership)", async () => {
  const { app, store, cleanup } = tempApp();
  try {
    const idNoteServer = store.store("a", { metadata: { kind: "note", tags: ["server", "recover"] } });
    const idDirectiveServer = store.store("b", { metadata: { kind: "directive", tags: ["server"] } });
    const idNotePlain = store.store("c", { metadata: { kind: "note" } });

    const byKind = await call(app, "GET", "/memories?kind=note");
    assert.deepEqual(
      byKind.json.map((m: any) => m.id).sort(),
      [idNoteServer, idNotePlain].sort(),
    );

    // Repeated kind values OR (kind is scalar — ANDing them could never match).
    const byKinds = await call(app, "GET", "/memories?kind=note&kind=directive");
    assert.deepEqual(
      byKinds.json.map((m: any) => m.id).sort(),
      [idNoteServer, idDirectiveServer, idNotePlain].sort(),
    );

    const byTag = await call(app, "GET", "/memories?tag=server");
    assert.equal(byTag.json.length, 2);

    const byBoth = await call(app, "GET", "/memories?tag=server&tag=recover");
    assert.deepEqual(byBoth.json.map((m: any) => m.id), [idNoteServer]);

    const search = await call(app, "GET", "/search?q=a&kind=note&tag=server");
    assert.equal(search.status, 200);
    assert.deepEqual(search.json.map((m: any) => m.id), [idNoteServer]);

    const tags = await call(app, "GET", "/tags?tag=server");
    assert.equal(tags.json.length, 2);
    assert.deepEqual(tags.json.filter((x: any) => x.tag === "server"), [{ tag: "server", count: 2 }]);

    // Values are escaped literals: a quote in the filter matches literally.
    const quoted = await call(app, "GET", "/memories?kind=" + encodeURIComponent("note'"));
    assert.equal(quoted.json.length, 0);

    // where + structured = rejected in every mode.
    assert.equal((await call(app, "GET", "/memories?where=1&kind=note")).status, 400);
    assert.equal((await call(app, "GET", "/search?q=a&tag=server&where=1")).status, 400);
  } finally {
    cleanup();
  }
});

test("structured filters: legacy --where behavior is unchanged in local mode", async () => {
  const { app, store, cleanup } = tempApp();
  try {
    store.store("d", { metadata: { kind: "directive" } });
    store.store("n", { metadata: { kind: "note" } });
    const listed = await call(
      app,
      "GET",
      "/memories?where=" + encodeURIComponent("metadata->>'$.kind' = 'directive'"),
    );
    assert.equal(listed.status, 200);
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].content, "d");
  } finally {
    cleanup();
  }
});

test("token mode: GET / lists only the presenting token's grant, no db path", async () => {
  const { app, cleanup } = tempApp({
    stores: [{ name: "cold", dbPath: join(tmpdir(), "souvenance-auth-test-hidden.db"), mode: "ro" }],
    tokens: [parseTokenSpec(`val=${SECRET}@cold:rw`)],
  });
  try {
    const { status, json } = await call(app, "GET", "/", undefined, SECRET);
    assert.equal(status, 200);
    assert.deepEqual(json.stores, [{ name: "cold", mode: "rw" }]);
    assert.ok(!JSON.stringify(json).includes("souvenance-auth-test-hidden.db"));
    assert.match(json.note, /grants store 'cold' in mode 'rw'/);
  } finally {
    cleanup();
  }
});

test("createApp rejects ambiguous or inconsistent token setups", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-auth-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  try {
    // duplicate secrets are ambiguous
    assert.throws(
      () =>
        createApp(store, {
          tokens: [parseTokenSpec(`a=${SECRET}`), parseTokenSpec(`b=${SECRET}`)],
        }),
      /duplicate token secret/,
    );
    // grant on an undeclared store
    assert.throws(
      () => createApp(store, { tokens: [parseTokenSpec(`a=${SECRET}@ghost`)] }),
      /grants unknown store 'ghost'/,
    );
    // an auxiliary store named 'root' would shadow the grant pseudo-name
    assert.throws(
      () => createApp(store, { stores: [{ name: "root", dbPath: join(dir, "x.db"), mode: "ro" }] }),
      /'root' is reserved/,
    );
    // store-level :rw is replaced by per-token grants in token mode
    assert.throws(
      () =>
        createApp(store, {
          stores: [{ name: "cold", dbPath: join(dir, "x.db"), mode: "rw" }],
          tokens: [parseTokenSpec(`a=${SECRET}`)],
        }),
      /not honored in token mode/,
    );
    // ro mounts are fine in token mode
    assert.doesNotThrow(() =>
      createApp(store, {
        stores: [{ name: "cold", dbPath: join(dir, "x.db"), mode: "ro" }],
        tokens: [parseTokenSpec(`a=${SECRET}@cold:rw`)],
      }),
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("token mode: aux store granted rw accepts writes through its mount", async () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-auth-test-"));
  try {
    const auxPath = join(dir, "aux.db");
    Store.open({ dbPath: auxPath }).close();
    const { app, cleanup } = tempApp({
      stores: [{ name: "cold", dbPath: auxPath, mode: "ro" }],
      tokens: [parseTokenSpec(`val=${SECRET}@cold:rw`)],
    });
    try {
      const made = await call(app, "POST", "/cold/memories", { content: "into the aux" }, SECRET);
      assert.equal(made.status, 201);
      // The root store stays untouched by this token (403).
      assert.equal((await call(app, "POST", "/memories", { content: "no" }, SECRET)).status, 403);
      const persisted = Store.open({ dbPath: auxPath });
      try {
        assert.equal(persisted.list().length, 1);
      } finally {
        persisted.close();
      }
    } finally {
      cleanup();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
