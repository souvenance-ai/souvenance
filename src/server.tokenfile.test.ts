import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";
import { createApp, parseTokenFile, parseTokenSpec, type TokenGrant } from "./server.ts";

const SECRET = "souv-0123456789abcdef0123456789abcdef";
const SECRET_CI = "souv-fedcba9876543210fedcba9876543210";
const SECRET_W = "souv-aaaa1111bbbb2222cccc3333dddd4444";
const SECRET_R = "souv-99998888777766665555444433332222";
const SECRET_CLI = "souv-deadbeefdeadbeefdeadbeefdeadbeef";

/** A temp dir with a file written at an explicit mode (new files default to
 * 0644 — every token file in these tests is chmod'd deliberately). */
function tempFile(name: string, content: string, mode = 0o600): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-tokenfile-test-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  chmodSync(path, mode);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A temp store + app in token mode with the given grants. */
function tempApp(tokens: TokenGrant[]): { app: ReturnType<typeof createApp>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-tokenfile-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  const app = createApp(store, { tokens, host: "127.0.0.1" });
  return {
    app,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function call(
  app: ReturnType<typeof createApp>,
  path: string,
  bearer?: string,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    headers: bearer !== undefined ? { authorization: `Bearer ${bearer}` } : {},
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

test("tokenfile: happy path — comments, blanks, export prefix, quotes, modifiers", () => {
  const { path, cleanup } = tempFile(
    "tokens.env",
    [
      "# bearer grants — one MEMORY_TOKEN_<agent> per line",
      "",
      `MEMORY_TOKEN_valentin=${SECRET}`,
      `export MEMORY_TOKEN_ci=${SECRET_CI}@notes`,
      `MEMORY_TOKEN_writer="${SECRET_W}@root:rw"`,
      `MEMORY_TOKEN_recon='${SECRET_R}:where'`,
      "",
    ].join("\n"),
  );
  try {
    const grants = parseTokenFile(path);
    assert.equal(grants.length, 4);
    assert.deepEqual(grants[0], { agent: "valentin", token: SECRET, store: "root", mode: "ro", where: false });
    assert.deepEqual(grants[1], { agent: "ci", token: SECRET_CI, store: "notes", mode: "ro", where: false });
    assert.deepEqual(grants[2], { agent: "writer", token: SECRET_W, store: "root", mode: "rw", where: false });
    assert.deepEqual(grants[3], { agent: "recon", token: SECRET_R, store: "root", mode: "ro", where: true });
  } finally {
    cleanup();
  }
});

test("tokenfile: hyphen agents ride as underscores in the key (dotenv-valid), bare hyphen keys also parse", () => {
  const underscore = tempFile("a.env", `MEMORY_TOKEN_valentin_2=${SECRET}`);
  const hyphen = tempFile("b.env", `MEMORY_TOKEN_valentin-2=${SECRET}`);
  try {
    assert.equal(parseTokenFile(underscore.path)[0].agent, "valentin-2");
    assert.equal(parseTokenFile(hyphen.path)[0].agent, "valentin-2");
  } finally {
    underscore.cleanup();
    hyphen.cleanup();
  }
});

test("tokenfile: BOM and CRLF tolerated", () => {
  const { path, cleanup } = tempFile("tokens.env", `\uFEFFMEMORY_TOKEN_ci=${SECRET}\r\n`);
  try {
    const grants = parseTokenFile(path);
    assert.equal(grants.length, 1);
    assert.equal(grants[0].agent, "ci");
  } finally {
    cleanup();
  }
});

test("tokenfile: strict — unknown key names the offending line", () => {
  const { path, cleanup } = tempFile("tokens.env", `OTHER=1\nMEMORY_TOKEN_ci=${SECRET}`);
  try {
    assert.throws(() => parseTokenFile(path), /line 1.*unexpected key 'OTHER'.*MEMORY_TOKEN_/);
  } finally {
    cleanup();
  }
});

test("tokenfile: strict — a line without '=' names the line", () => {
  const { path, cleanup } = tempFile("tokens.env", `MEMORY_TOKEN_ci ${SECRET}`);
  try {
    assert.throws(() => parseTokenFile(path), /line 1.*expected KEY=VALUE/);
  } finally {
    cleanup();
  }
});

test("tokenfile: strict — duplicate agent refused with both line numbers", () => {
  const { path, cleanup } = tempFile(
    "tokens.env",
    `MEMORY_TOKEN_ci=${SECRET}\nMEMORY_TOKEN_ci=${SECRET_CI}`,
  );
  try {
    assert.throws(() => parseTokenFile(path), /line 2.*duplicate agent 'ci'.*line 1/);
  } finally {
    cleanup();
  }
});

test("tokenfile: strict — empty and comment-only files refuse", () => {
  for (const content of ["", "# just a comment\n\n"]) {
    const { path, cleanup } = tempFile("tokens.env", content);
    try {
      assert.throws(() => parseTokenFile(path), /no MEMORY_TOKEN_<agent> entries/);
    } finally {
      cleanup();
    }
  }
});

test("tokenfile: strict — missing file, empty agent, bad value all refuse", () => {
  assert.throws(() => parseTokenFile("/nonexistent/tokens.env"), /token file not found/);
  const emptyAgent = tempFile("a.env", "MEMORY_TOKEN_=short");
  const badValue = tempFile("b.env", `MEMORY_TOKEN_ci=short`);
  try {
    assert.throws(() => parseTokenFile(emptyAgent.path), /line 1/);
    assert.throws(() => parseTokenFile(badValue.path), /line 1.*the secret must be 'souv-'/);
  } finally {
    emptyAgent.cleanup();
    badValue.cleanup();
  }
});

test("tokenfile: POSIX perms — owner-only parses, group/world-readable refuses", { skip: process.platform === "win32" }, () => {
  const content = `MEMORY_TOKEN_ci=${SECRET}`;
  const ok = tempFile("ok.env", content, 0o600);
  const group = tempFile("group.env", content, 0o640);
  const world = tempFile("world.env", content, 0o644);
  try {
    assert.equal(parseTokenFile(ok.path).length, 1);
    assert.throws(() => parseTokenFile(group.path), /chmod 600/);
    assert.throws(() => parseTokenFile(world.path), /mode 0644.*chmod 600/);
  } finally {
    ok.cleanup();
    group.cleanup();
    world.cleanup();
  }
});

test("tokenfile: e2e — file grants authenticate; per-token rw respected", async () => {
  const file = tempFile("tokens.env", `MEMORY_TOKEN_valentin=${SECRET}\nMEMORY_TOKEN_ci=${SECRET_CI}@root:rw`);
  try {
    const tokens = parseTokenFile(file.path);
    const { app, cleanup } = tempApp(tokens);
    try {
      // anonymous -> 401; file secrets authenticate
      assert.equal((await call(app, "/")).status, 401);
      assert.equal((await call(app, "/", SECRET)).status, 200);
      // ro token: writes refused (409); rw token: writes accepted (201)
      const roWrite = await app.request("/memories", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ content: "ro attempt" }),
      });
      assert.equal(roWrite.status, 409);
      const rwWrite = await app.request("/memories", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET_CI}`, "content-type": "application/json" },
        body: JSON.stringify({ content: "rw accepted" }),
      });
      assert.equal(rwWrite.status, 201);
      // GET / lists only the presenting grant
      const listing = await call(app, "/", SECRET);
      assert.deepEqual(listing.json.stores, [{ name: "root", mode: "ro" }]);
      assert.ok(!JSON.stringify(listing.json).includes("tokens.env"));
    } finally {
      cleanup();
    }
  } finally {
    file.cleanup();
  }
});

test("tokenfile: e2e — inline --token grants and file grants compose", async () => {
  const file = tempFile("tokens.env", `MEMORY_TOKEN_valentin=${SECRET}`);
  try {
    const tokens = [...parseTokenFile(file.path), parseTokenSpec(`cli=${SECRET_CLI}:rw`)];
    const { app, cleanup } = tempApp(tokens);
    try {
      assert.equal((await call(app, "/", SECRET)).status, 200);
      assert.equal((await call(app, "/", SECRET_CLI)).status, 200);
      assert.equal((await call(app, "/", "wrongsecretwrongsec")).status, 401);
    } finally {
      cleanup();
    }
  } finally {
    file.cleanup();
  }
});
