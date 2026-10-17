import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";
import { createApp } from "./server.ts";

function tempApp(): { app: ReturnType<typeof createApp>; store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-server-test-"));
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

/** Runs a request and parses the JSON body (null for empty bodies like 204). */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("server: root describes the service", async () => {
  const { app, cleanup } = tempApp();
  try {
    const { status, json } = await call(app, "GET", "/");
    assert.equal(status, 200);
    assert.equal(json.name, "ai-memory");
    assert.ok(json.endpoints.length > 0);
  } finally {
    cleanup();
  }
});

test("server: POST /memories stores, GET /memories/:id round-trips", async () => {
  const { app, cleanup } = tempApp();
  try {
    const created = await call(app, "POST", "/memories", {
      content: "tabs over spaces",
      metadata: { kind: "preference", tags: ["tabs"] },
      weight: 0.9,
    });
    assert.equal(created.status, 201);
    const id = created.json.id as string;
    assert.match(id, UUID_RE);

    const got = await call(app, "GET", `/memories/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.content, "tabs over spaces");
    assert.deepEqual(got.json.metadata, { kind: "preference", tags: ["tabs"] });
    assert.equal(got.json.weight, 0.9);
    assert.equal(got.json.status, "active");
  } finally {
    cleanup();
  }
});

test("server: GET unknown id -> 404 {error}", async () => {
  const { app, cleanup } = tempApp();
  try {
    const { status, json } = await call(
      app,
      "GET",
      "/memories/00000000-0000-0000-0000-000000000000",
    );
    assert.equal(status, 404);
    assert.match(json.error, /memory not found/);
  } finally {
    cleanup();
  }
});

test("server: POST /memories validates content, weight, metadata and JSON body", async () => {
  const { app, cleanup } = tempApp();
  try {
    const empty = await call(app, "POST", "/memories", { content: "" });
    assert.equal(empty.status, 400);
    assert.match(empty.json.error, /content must be a non-empty string/);

    const badWeight = await call(app, "POST", "/memories", { content: "x", weight: 1.5 });
    assert.equal(badWeight.status, 400);
    assert.match(badWeight.json.error, /weight must be a number between 0 and 1/);

    const badMeta = await call(app, "POST", "/memories", { content: "x", metadata: [1] });
    assert.equal(badMeta.status, 400);
    assert.match(badMeta.json.error, /metadata must be a JSON object/);

    const res = await app.request("/memories", {
      method: "POST",
      body: "{oops",
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.status, 400);
    assert.match(await res.json().then((b: any) => b.error), /valid JSON/);
  } finally {
    cleanup();
  }
});

test("server: GET /memories honors limit, min-weight and all", async () => {
  const { app, store, cleanup } = tempApp();
  try {
    const hot = store.store("hot memory", { weight: 0.9 });
    const warm = store.store("warm memory", { weight: 0.5 });
    store.store("cold memory", { weight: 0.5 });
    store.deprecate(warm);

    const all = await call(app, "GET", "/memories");
    assert.equal(all.status, 200);
    assert.equal(all.json.length, 2); // active only: hot + cold

    const limited = await call(app, "GET", "/memories?limit=1");
    assert.equal(limited.json.length, 1);

    const hotOnly = await call(app, "GET", "/memories?min-weight=0.7");
    assert.equal(hotOnly.json.length, 1);
    assert.equal(hotOnly.json[0].id, hot);

    const legacy = await call(app, "GET", "/memories?all=1");
    assert.equal(legacy.json.length, 3);

    const badLimit = await call(app, "GET", "/memories?limit=abc");
    assert.equal(badLimit.status, 400);
  } finally {
    cleanup();
  }
});

test("server: GET /search returns ranked results and rejects bad queries", async () => {
  const { app, store, cleanup } = tempApp();
  try {
    store.store("the better-sqlite3 sanitizer splits hyphenated tokens", {
      metadata: { kind: "note" },
    });
    store.store("unrelated content", {});

    const hit = await call(app, "GET", '/search?q="better-sqlite3"');
    assert.equal(hit.status, 200);
    assert.equal(hit.json.length, 1);
    assert.equal(typeof hit.json[0].rank, "number");

    const noQuery = await call(app, "GET", "/search?q=");
    assert.equal(noQuery.status, 400);
    assert.match(noQuery.json.error, /q must be non-empty/);

    const badWhere = await call(app, "GET", "/search?q=x&where=nonsense_column = 1");
    assert.equal(badWhere.status, 400);
    assert.match(badWhere.json.error, /no such column/);
  } finally {
    cleanup();
  }
});

test("server: supersede lifecycle -> 201 new id, old superseded, deprecate conflicts", async () => {
  const { app, cleanup } = tempApp();
  try {
    const a = store_standalone(await call(app, "POST", "/memories", { content: "v1: use tabs" }));
    const sup = await call(app, "POST", `/memories/${a}/supersede`, { content: "v2: use spaces" });
    assert.equal(sup.status, 201);
    assert.match(sup.json.id, UUID_RE);

    const old = await call(app, "GET", `/memories/${a}`);
    assert.equal(old.json.status, "superseded");

    const conflict = await call(app, "POST", `/memories/${a}/deprecate`);
    assert.equal(conflict.status, 409);
    assert.match(conflict.json.error, /status 'superseded'/);

    const notFound = await call(app, "POST", "/memories/00000000-0000-0000-0000-000000000000/supersede", {
      content: "orphan",
    });
    assert.equal(notFound.status, 404);

    const noContent = await call(app, "POST", `/memories/${a}/supersede`, { content: "" });
    assert.equal(noContent.status, 400);
  } finally {
    cleanup();
  }
});

test("server: deprecate soft-deletes and reports the new status", async () => {
  const { app, cleanup } = tempApp();
  try {
    const a = store_standalone(await call(app, "POST", "/memories", { content: "to deprecate" }));
    const dep = await call(app, "POST", `/memories/${a}/deprecate`);
    assert.equal(dep.status, 200);
    assert.deepEqual(dep.json, { id: a, status: "deprecated" });

    const hidden = await call(app, "GET", "/memories");
    assert.equal(hidden.json.length, 0); // active-only by default
  } finally {
    cleanup();
  }
});

test("server: link creates an edge, relations reads it back", async () => {
  const { app, cleanup } = tempApp();
  try {
    const a = store_standalone(await call(app, "POST", "/memories", { content: "from" }));
    const b = store_standalone(await call(app, "POST", "/memories", { content: "to" }));
    const linked = await call(app, "POST", `/memories/${a}/link`, { to: b, kind: "references" });
    assert.equal(linked.status, 201);
    assert.deepEqual(linked.json, { from_id: a, to_id: b, kind: "references" });

    const out = await call(app, "GET", `/memories/${a}/relations?direction=out`);
    assert.equal(out.status, 200);
    assert.equal(out.json.length, 1);
    assert.equal(out.json[0].kind, "references");

    const badDir = await call(app, "GET", `/memories/${a}/relations?direction=sideways`);
    assert.equal(badDir.status, 400);

    const missing = await call(app, "GET", "/memories/00000000-0000-0000-0000-000000000000/relations");
    assert.equal(missing.status, 404);
  } finally {
    cleanup();
  }
});

test("server: merge combines actives and rejects degenerate input", async () => {
  const { app, cleanup } = tempApp();
  try {
    const a = store_standalone(await call(app, "POST", "/memories", { content: "one" }));
    const b = store_standalone(await call(app, "POST", "/memories", { content: "two" }));
    const merged = await call(app, "POST", "/merge", { ids: [a, b], content: "one + two" });
    assert.equal(merged.status, 201);
    assert.match(merged.json.id, UUID_RE);
    assert.equal((await call(app, "GET", `/memories/${a}`)).json.status, "merged");
    assert.equal((await call(app, "GET", `/memories/${b}`)).json.status, "merged");

    const tooFew = await call(app, "POST", "/merge", { ids: [a], content: "solo" });
    assert.equal(tooFew.status, 400);

    const dupe = await call(app, "POST", "/merge", {
      ids: [b, b],
      content: "dup",
    });
    assert.equal(dupe.status, 400);
    assert.match(dupe.json.error, /duplicate id/);
  } finally {
    cleanup();
  }
});

test("server: PATCH updates metadata and weight, requires at least one", async () => {
  const { app, cleanup } = tempApp();
  try {
    const a = store_standalone(await call(app, "POST", "/memories", { content: "patchable" }));
    const patched = await call(app, "PATCH", `/memories/${a}`, {
      metadata: { kind: "note" },
      weight: 0.8,
    });
    assert.equal(patched.status, 204);

    const got = await call(app, "GET", `/memories/${a}`);
    assert.equal(got.json.weight, 0.8);
    assert.deepEqual(got.json.metadata, { kind: "note" });

    const empty = await call(app, "PATCH", `/memories/${a}`, {});
    assert.equal(empty.status, 400);
    assert.match(empty.json.error, /requires metadata and\/or weight/);

    const missing = await call(app, "PATCH", "/memories/00000000-0000-0000-0000-000000000000", {
      weight: 0.5,
    });
    assert.equal(missing.status, 404);
  } finally {
    cleanup();
  }
});

test("server: DELETE is a guarded destructive operation", async () => {
  const { app, cleanup } = tempApp();
  try {
    const a = store_standalone(await call(app, "POST", "/memories", { content: "deletable" }));
    const guarded = await call(app, "DELETE", `/memories/${a}`);
    assert.equal(guarded.status, 409);
    assert.match(guarded.json.error, /force=1|deprecate/);
    assert.equal((await call(app, "GET", `/memories/${a}`)).status, 200);

    const forced = await call(app, "DELETE", `/memories/${a}?force=1`);
    assert.equal(forced.status, 204);
    assert.equal((await call(app, "GET", `/memories/${a}`)).status, 404);

    const gone = await call(app, "DELETE", `/memories/${a}?force=1`);
    assert.equal(gone.status, 404);
  } finally {
    cleanup();
  }
});

test("server: stats, tags and doctor endpoints", async () => {
  const { app, cleanup } = tempApp();
  try {
    const a = store_standalone(
      await call(app, "POST", "/memories", {
        content: "tagged",
        metadata: { kind: "note", tags: ["x"] },
      }),
    );
    const b = store_standalone(
      await call(app, "POST", "/memories", {
        content: "tagged too",
        metadata: { kind: "note", tags: ["x"] },
      }),
    );
    await call(app, "POST", `/memories/${a}/link`, { to: b, kind: "references" });

    const stats = await call(app, "GET", "/stats");
    assert.equal(stats.json.active_memories, 2);
    assert.equal(stats.json.edges, 1);

    const tags = await call(app, "GET", "/tags");
    assert.deepEqual(tags.json, [{ tag: "x", count: 2 }]);

    const doctor = await call(app, "GET", "/doctor");
    assert.equal(doctor.status, 200);
    assert.equal(doctor.json.healthy, true);

    const fixed = await call(app, "POST", "/doctor", { fix: true });
    assert.equal(fixed.json.summary.fts_rebuilt, true);
  } finally {
    cleanup();
  }
});

test("server: unknown route -> JSON 404", async () => {
  const { app, cleanup } = tempApp();
  try {
    const { status, json } = await call(app, "GET", "/nope");
    assert.equal(status, 404);
    assert.deepEqual(json, { error: "not found" });
  } finally {
    cleanup();
  }
});

/** Extracts the id from a 201 {id} response (asserts the happy shape first). */
function store_standalone(created: { status: number; json: any }): string {
  assert.equal(created.status, 201);
  const id = created.json.id as string;
  assert.match(id, UUID_RE);
  return id;
}
