import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Store } from "./db.ts";
import { runMcpServer } from "./mcp.ts";

/** A fresh store wired to the server with a fake synchronous output (every
 *  write lands in `collected` at once — the server answers all lines of a
 *  chunk synchronously) and a PassThrough input. */
function rig(): {
  rpc: (lines: string[], expected: number) => Promise<any[]>;
  close: () => Promise<void>;
} {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-mcp-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  const input = new PassThrough();
  const collected: string[] = [];
  const running = runMcpServer(store, { input, output: { write: (data) => collected.push(data) } });
  const rpc = async (lines: string[], expected: number): Promise<any[]> => {
    const before = collected.length;
    input.write(lines.join("\n") + "\n");
    for (let i = 0; collected.length < before + expected && i < 100; i++) {
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(collected.length, before + expected, "expected responses did not arrive");
    return collected.slice(before).map((l) => JSON.parse(l));
  };
  return {
    rpc,
    close: async () => {
      input.end();
      await running;
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const INIT = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } });
const READY = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });

/** A single tools/call; returns the parsed text payload, or {isError, text}
 *  when the tool failed. (initialize answers too — expected 2, filter by id.) */
async function call(
  r: ReturnType<typeof rig>,
  name: string,
  args: Record<string, unknown> = {},
  id = 1,
): Promise<{ isError?: boolean; result?: any; text: string }> {
  const responses = await r.rpc(
    [INIT, READY, JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })],
    2,
  );
  const response = responses.find((x) => x.id === id);
  assert.ok(response, `no response for id ${id}`);
  const result = response.result;
  assert.ok(Array.isArray(result.content) && result.content[0].type === "text");
  const text = result.content[0].text;
  return { isError: result.isError, result: result.isError ? undefined : JSON.parse(text), text };
}

test("mcp: initialize echoes a known protocolVersion and carries serverInfo + instructions", async () => {
  const r = rig();
  try {
    const [response] = await r.rpc([INIT], 1);
    assert.equal(response.id, 0);
    assert.equal(response.result.protocolVersion, "2025-06-18");
    assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
    assert.equal(response.result.serverInfo.name, "ai-memory");
    assert.match(response.result.instructions, /recover FIRST/);
  } finally {
    await r.close();
  }
});

test("mcp: initialize echoes an older requested revision, falls back on unknown ones", async () => {
  const r = rig();
  try {
    const [older] = await r.rpc(
      [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })],
      1,
    );
    assert.equal(older.result.protocolVersion, "2025-03-26");
    const [fallback] = await r.rpc(
      [JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })],
      1,
    );
    assert.equal(fallback.result.protocolVersion, "2025-06-18");
  } finally {
    await r.close();
  }
});

test("mcp: tools/list exposes the CLI verb set, one input schema each", async () => {
  const r = rig();
  try {
    const [response] = await r.rpc([JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })], 1);
    const names = response.result.tools.map((t: any) => t.name);
    for (const expected of [
      "recover", "store", "supersede", "merge", "update", "link", "deprecate", "delete",
      "get", "search", "list", "relations", "tags", "stats", "doctor",
    ]) {
      assert.ok(names.includes(expected), `missing tool: ${expected}`);
    }
    for (const tool of response.result.tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(typeof tool.description, "string");
    }
  } finally {
    await r.close();
  }
});

test("mcp: store -> get -> search -> list roundtrip; access_count bumped by get", async () => {
  const r = rig();
  try {
    const stored = await call(r, "store", {
      content: "The user prefers tabs over spaces",
      metadata: { kind: "preference" },
      weight: 0.9,
    });
    const id = stored.result.id;
    assert.match(id, /^[0-9a-f-]{36}$/);
    const gotten = await call(r, "get", { id });
    assert.equal(gotten.result.content, "The user prefers tabs over spaces");
    assert.equal(gotten.result.metadata.kind, "preference");
    assert.equal(gotten.result.weight, 0.9);
    assert.equal(gotten.result.access_count, 0); // the count BEFORE this get
    assert.equal((await call(r, "get", { id })).result.access_count, 1); // bumped by the first
    const found = await call(r, "search", { query: "tabs" });
    assert.equal(found.result.length, 1);
    assert.equal(found.result[0].id, id);
    const listed = await call(r, "list", { where: "metadata->>'$.kind' = 'preference'" });
    assert.equal(listed.result.length, 1);
  } finally {
    await r.close();
  }
});

test("mcp: lifecycle — supersede, deprecate, merge, update, delete-with-force", async () => {
  const r = rig();
  try {
    const a = (await call(r, "store", { content: "decision A", metadata: { kind: "decision" } })).result.id;
    const b = (await call(r, "store", { content: "decision B", metadata: { kind: "decision" } })).result.id;
    const superseded = await call(r, "supersede", { id: a, content: "decision A revised" });
    const a2 = superseded.result.id;
    assert.notEqual(a2, a);
    const old = await call(r, "get", { id: a });
    assert.equal(old.result.status, "superseded");
    const rels = await call(r, "relations", { id: a });
    assert.equal(rels.result[0].kind, "supersedes");
    assert.equal(rels.result[0].to_id, a2);
    const linked = await call(r, "link", { from: b, to: a2, kind: "references" });
    assert.equal(linked.result, "linked");
    const updated = await call(r, "update", { id: b, weight: 0.8 });
    assert.equal(updated.result, "updated");
    assert.equal((await call(r, "get", { id: b })).result.weight, 0.8);
    const merged = await call(r, "merge", { ids: [a2, b], content: "decision merged" });
    const mId = merged.result.id;
    assert.match(mId, /^[0-9a-f-]{36}$/);
    // resolve now lands: a -> a2 (superseded... now merged) -> the terminal successor
    const resolved = await call(r, "relations", { id: a, resolve: true });
    assert.equal(resolved.result[0].resolved_to, mId);
    const deprec = await call(r, "deprecate", { id: merged.result.id });
    assert.equal(deprec.result, "deprecated");
    const hidden = await call(r, "list", { where: "metadata->>'$.kind' = 'decision'" });
    assert.equal(hidden.result.length, 0);
    const legacy = await call(r, "list", { where: "metadata->>'$.kind' = 'decision'", all: true });
    assert.equal(legacy.result.length, 4); // A, revised A2, B, merged (deprecated)
    const refused = await call(r, "delete", { id: a });
    assert.equal(refused.isError, true);
    assert.match(refused.text, /force/);
    await call(r, "delete", { id: a, force: true });
    assert.equal((await call(r, "get", { id: a })).result, null);
  } finally {
    await r.close();
  }
});

test("mcp: recover bundles directives, summaries, objectives and stats", async () => {
  const r = rig();
  try {
    await call(r, "store", { content: "# Directive: rule", metadata: { kind: "directive" } }, 1);
    await call(r, "store", { content: "# Summary: done things", metadata: { kind: "summary" } }, 2);
    const open = await call(r, "store", {
      content: "# Objective: standing intent",
      metadata: { kind: "objective", state: "open" },
    }, 3);
    await call(r, "store", {
      content: "# Objective: parked until demand",
      metadata: { kind: "objective", state: "parked" },
    }, 4);
    const rec = await call(r, "recover", { summaries_limit: 1 }, 5);
    assert.equal(rec.result.directives.length, 1);
    assert.equal(rec.result.summaries.length, 1);
    assert.deepEqual(rec.result.objectives.map((m: { id: string }) => m.id), [open.result.id]);
    assert.equal(rec.result.stats.active_memories, 4);
    assert.equal(typeof rec.result.stats.edges, "number");
  } finally {
    await r.close();
  }
});

test("mcp: tags, stats, doctor over the tool surface", async () => {
  const r = rig();
  try {
    await call(r, "store", { content: "tagged", metadata: { kind: "note", tags: ["alpha"] } });
    const other = (await call(r, "store", { content: "other", metadata: { kind: "note" } })).result.id;
    const tagged = (await call(r, "search", { query: "tagged" })).result[0].id;
    await call(r, "link", { from: tagged, to: other, kind: "references" });
    const tags = await call(r, "tags");
    assert.deepEqual(tags.result, [{ tag: "alpha", count: 1 }]);
    const stats = await call(r, "stats");
    assert.equal(stats.result.active_memories, 2);
    const doctor = await call(r, "doctor");
    assert.equal(doctor.result.healthy, true);
  } finally {
    await r.close();
  }
});

test("mcp: input validation — bad types and negative limits are tool errors", async () => {
  const r = rig();
  try {
    assert.match((await call(r, "store", { content: 42 })).text, /'content' must be a string/);
    assert.match((await call(r, "store", { content: "x", weight: 2 })).text, /'weight' must be a number between 0 and 1/);
    assert.match((await call(r, "store", { content: "x", metadata: "no" })).text, /'metadata' must be a JSON object/);
    assert.match((await call(r, "list", { limit: "ten" })).text, /'limit' must be an integer/);
    assert.match((await call(r, "list", { limit: -1 })).text, /'limit' must be >= 0/);
    assert.match((await call(r, "relations", { id: "x", direction: "sideways" })).text, /'direction' must be one of/);
    assert.match((await call(r, "update", { id: "x" })).text, /update requires metadata or weight/);
    assert.match((await call(r, "merge", { ids: ["only-one"], content: "x" })).text, /at least 2 memories/);
  } finally {
    await r.close();
  }
});

test("mcp: protocol — ping, parse error, invalid request, unknown method, silent notifications", async () => {
  const r = rig();
  try {
    const responses = await r.rpc(
      [
        "not json at all",
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 9 } }),
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "wat/unknown" }),
        JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nosuch" } }),
      ],
      4,
    );
    assert.equal(responses[0].id, null);
    assert.equal(responses[0].error.code, -32700);
    assert.equal(responses[1].id, 1);
    assert.deepEqual(responses[1].result, {});
    assert.equal(responses[2].id, 2);
    assert.equal(responses[2].error.code, -32601);
    assert.equal(responses[3].id, 3);
    assert.equal(responses[3].result.isError, true);
    assert.match(responses[3].result.content[0].text, /unknown tool 'nosuch'/);
  } finally {
    await r.close();
  }
});

test("mcp: bin wiring — the real process speaks JSON-RPC over stdio", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-mcp-bin-test-"));
  const bin = fileURLToPath(new URL("../bin/memory.js", import.meta.url));
  const child = spawn(process.execPath, [bin, "--db", join(dir, "memory.db"), "mcp"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines: string[] = [];
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const until = (n: number) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (lines.length >= n) return resolve();
        if (Date.now() - started > 10_000) return reject(new Error(`timeout; stderr: ${stderr}`));
        setTimeout(tick, 25);
      };
      tick();
    });
  try {
    child.stdin.write(
      [
        INIT,
        READY,
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "store", arguments: { content: "via bin", weight: 0.7 } },
        }),
      ].join("\n") + "\n",
    );
    await until(2);
    const [init, stored] = lines.map((l) => JSON.parse(l));
    assert.equal(init.result.serverInfo.name, "ai-memory");
    const id = JSON.parse(stored.result.content[0].text).id;
    assert.match(id, /^[0-9a-f-]{36}$/);
  } finally {
    child.stdin.end();
    const [code] = await new Promise<[number | null]>((resolve) => child.once("exit", (c) => resolve([c])));
    assert.equal(code, 0); // clean shutdown after stdin end
    rmSync(dir, { recursive: true, force: true });
  }
});
