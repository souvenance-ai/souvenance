import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";
import { spawnSync } from "node:child_process";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "ai-memory-concurrency-"));
}

const BIN = join(process.cwd(), "bin", "memory.js");

function cli(dbPath: string, args: string): { stdout: string; stderr: string; code: number } {
  const result = spawnSync("node", [BIN, "--db", dbPath, ...args.split(" ")], {
    encoding: "utf-8",
    timeout: 30000,
  });
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    code: result.status ?? -1,
  };
}

test("concurrency: many concurrent stores all persist", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    const N = 20;
    const children = Array.from({ length: N }, (_, i) =>
      spawnSync("node", [BIN, "--db", dbPath, "store", `concurrent memory ${i}`], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    for (const child of children) {
      assert.equal(child.status, 0, `store should succeed, stderr: ${child.stderr}`);
      assert.ok(child.stdout.trim().length > 0, "store should print an id");
    }

    const store = Store.open({ dbPath: dbPath });
    try {
      assert.equal(store.stats().memories, N, `all ${N} memories should be persisted`);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: concurrent links from multiple processes all persist", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    // Seed two memories that everyone will link
    const a = cli(dbPath, 'store "source memory"').stdout;
    const b = cli(dbPath, 'store "target memory"').stdout;

    const N = 10;
    const children = Array.from({ length: N }, () =>
      spawnSync("node", [BIN, "--db", dbPath, "link", a, b, "--kind", "references"], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    for (const child of children) {
      assert.equal(child.status, 0, `link should succeed, stderr: ${child.stderr}`);
    }

    // Edges are idempotent (INSERT OR IGNORE on from/to/kind),
    // so N concurrent identical links should produce exactly 1 edge.
    const store = Store.open({ dbPath: dbPath });
    try {
      assert.equal(store.stats().edges, 1, "idempotent links should produce 1 edge");
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: concurrent links with different kinds all persist", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    const a = cli(dbPath, 'store "source memory"').stdout;
    const b = cli(dbPath, 'store "target memory"').stdout;

    const kinds = ["references", "supersedes", "merges", "constrained-by", "related"];
    const children = kinds.map((kind) =>
      spawnSync("node", [BIN, "--db", dbPath, "link", a, b, "--kind", kind], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    for (const child of children) {
      assert.equal(child.status, 0, `link should succeed, stderr: ${child.stderr}`);
    }

    const store = Store.open({ dbPath: dbPath });
    try {
      assert.equal(store.stats().edges, kinds.length, "different kinds should all persist");
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: concurrent supersede of the same memory — only one wins", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    const original = cli(dbPath, 'store "original to supersede"').stdout;

    const N = 5;
    const children = Array.from({ length: N }, (_, i) =>
      spawnSync(
        "node",
        [BIN, "--db", dbPath, "supersede", original, "--content", `replacement ${i}`],
        { encoding: "utf-8", timeout: 30000 },
      ),
    );

    let successes = 0;
    let failures = 0;
    for (const child of children) {
      if (child.status === 0) {
        successes++;
      } else {
        failures++;
      }
    }

    // At least one must succeed, but the constraint is:
    // exactly one success, because supersede checks status = 'active'
    // and marks it 'superseded' in a transaction. After the first commits,
    // the others should see 'superseded' and throw.
    assert.equal(successes, 1, `exactly 1 supersede should succeed, got ${successes}`);
    assert.equal(failures, N - 1, `the other ${N - 1} should fail, got ${failures}`);

    // Verify original is superseded and only 1 replacement exists
    const store = Store.open({ dbPath: dbPath });
    try {
      const orig = store.get(original);
      assert.equal(orig?.status, "superseded", "original should be superseded");

      const active = store.list({ limit: 100 });
      const replacements = active.filter((m) => m.content.startsWith("replacement "));
      assert.equal(replacements.length, 1, "exactly 1 replacement should be active");
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: concurrent merge of overlapping memories — only one wins", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    const a = cli(dbPath, 'store "merge candidate A"').stdout;
    const b = cli(dbPath, 'store "merge candidate B"').stdout;

    const N = 5;
    const children = Array.from({ length: N }, (_, i) =>
      spawnSync(
        "node",
        [BIN, "--db", dbPath, "merge", a, b, "--content", `merged result ${i}`],
        { encoding: "utf-8", timeout: 30000 },
      ),
    );

    let successes = 0;
    for (const child of children) {
      if (child.status === 0) successes++;
    }

    assert.equal(successes, 1, `exactly 1 merge should succeed, got ${successes}`);

    const store = Store.open({ dbPath: dbPath });
    try {
      const memA = store.get(a);
      const memB = store.get(b);
      assert.equal(memA?.status, "merged", "a should be merged");
      assert.equal(memB?.status, "merged", "b should be merged");

      const active = store.list({ limit: 100 });
      const merged = active.filter((m) => m.content.startsWith("merged result "));
      assert.equal(merged.length, 1, "exactly 1 merged result should be active");
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: concurrent deprecate of the same memory — all succeed (idempotent)", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    const a = cli(dbPath, 'store "to be deprecated"').stdout;

    const N = 5;
    const children = Array.from({ length: N }, () =>
      spawnSync("node", [BIN, "--db", dbPath, "deprecate", a], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    // deprecate sets status = 'deprecated' unconditionally.
    // The first sets it to deprecated. The rest call assertActive which
    // checks status === 'active' and will throw.
    let successes = 0;
    let failures = 0;
    for (const child of children) {
      if (child.status === 0) successes++;
      else failures++;
    }

    assert.equal(successes, 1, `exactly 1 deprecate should succeed, got ${successes}`);
    assert.equal(failures, N - 1, `the rest should fail on non-active status`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: reads during concurrent writes return consistent state", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    // Seed initial data
    cli(dbPath, 'store "initial memory zero"');

    const N_WRITERS = 10;
    const N_READERS = 10;

    // Start all writers and readers simultaneously
    const writers = Array.from({ length: N_WRITERS }, (_, i) =>
      spawnSync("node", [BIN, "--db", dbPath, "store", `write ${i}`], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    const readers = Array.from({ length: N_READERS }, () =>
      spawnSync("node", [BIN, "--db", dbPath, "stats"], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    for (const w of writers) {
      assert.equal(w.status, 0, `writer should succeed, stderr: ${w.stderr}`);
    }
    for (const r of readers) {
      assert.equal(r.status, 0, `reader should succeed, stderr: ${r.stderr}`);
      const stats = JSON.parse(r.stdout);
      // Readers should see at least 1 memory (the initial one)
      assert.ok(stats.memories >= 1, `reader should see at least 1 memory, saw ${stats.memories}`);
    }

    // After all writers complete, total should be exact
    const store = Store.open({ dbPath: dbPath });
    try {
      assert.equal(store.stats().memories, N_WRITERS + 1, "all writes should persist");
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: concurrent store + link to the same target", () => {
  const dir = tempDir();
  const dbPath = join(dir, "memory.db");
  try {
    const target = cli(dbPath, 'store "target for links"').stdout;

    const N = 10;
    const children = Array.from({ length: N }, (_, i) =>
      spawnSync("node", [BIN, "--db", dbPath, "store", `source ${i}`], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    // All stores succeeded, collect their ids
    const sourceIds = children.map((c) => {
      assert.equal(c.status, 0, `store should succeed, stderr: ${c.stderr}`);
      return c.stdout.trim();
    });

    // Now link all sources to the target concurrently
    const linkChildren = sourceIds.map((id) =>
      spawnSync("node", [BIN, "--db", dbPath, "link", id, target, "--kind", "references"], {
        encoding: "utf-8",
        timeout: 30000,
      }),
    );

    for (const c of linkChildren) {
      assert.equal(c.status, 0, `link should succeed, stderr: ${c.stderr}`);
    }

    const store = Store.open({ dbPath: dbPath });
    try {
      const targetRels = store.relations(target, { direction: "in" });
      assert.equal(targetRels.length, N, `target should have ${N} incoming edges`);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
