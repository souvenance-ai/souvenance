import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";

function tempStore(): { store: Store; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-fork-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  return {
    store,
    dir,
    cleanup: () => {
      try {
        store.close();
      } catch {
        // already closed by the test itself (e.g. the read-only fork test)
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("fork copies the full store and the child is born knowing its origin", () => {
  const { store, dir, cleanup } = tempStore();
  try {
    const a = store.store("The alpha memory: FTS needle kiwi.", { metadata: { kind: "note" } });
    const b = store.store("The beta memory: another doc for the graph.", { metadata: { kind: "note" } });
    store.link(a, b, "references");
    const s = store.store("An old handoff summary from the origin.", { metadata: { kind: "summary" }, weight: 0.8 });

    const result = store.fork(join(dir, "fork.db"));
    assert.equal(result.memories, 3);
    assert.equal(result.edges, 1); // copied rows only — the provenance's edge is added after counting
    assert.equal(existsSync(result.path), true);
    assert.equal(result.path, join(dir, "fork.db"));

    const child = Store.open({ dbPath: result.path });
    try {
      // Full copy: the three inherited memories plus the provenance one.
      const all = child.list({ includeLegacy: true, limit: 100 });
      assert.equal(all.length, 4);
      // FTS index travels with the copy.
      const hits = child.search("kiwi");
      assert.equal(hits.length, 1);
      assert.equal(hits[0].id, a);
      // The provenance memory: kind summary (recovery-visible), newest, self-contained.
      const summaries = child.list({ where: "metadata->>'$.kind' = 'summary'", limit: 10 });
      assert.equal(summaries.length, 2); // the inherited one + the provenance
      assert.equal(summaries[0].id, result.provenance);
      assert.match(summaries[0].content, /fork/);
      assert.match(summaries[0].content, new RegExp(store.dbPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      // Anchored in the graph: continues the inherited tip, not itself.
      const rels = child.relations(result.provenance);
      assert.equal(rels.length, 1);
      assert.equal(rels[0].kind, "continues");
      assert.equal(rels[0].to_id, s);
    } finally {
      child.close();
    }
  } finally {
    cleanup();
  }
});

test("fork refuses an existing target without force; force refreshes to one provenance", () => {
  const { store, dir, cleanup } = tempStore();
  try {
    const target = join(dir, "fork.db");
    store.store("A memory worth keeping.", { metadata: { kind: "note" } });
    store.fork(target);
    assert.throws(() => store.fork(target), /already exists/);

    // The refresh path: force wipes the old file (and its WAL sidecars) first.
    store.update(store.list({ limit: 1 })[0].id, { weight: 0.9 });
    const result = store.fork(target, { force: true });
    const child = Store.open({ dbPath: result.path });
    try {
      const summaries = child.list({ where: "metadata->>'$.kind' = 'summary'", limit: 10 });
      assert.equal(summaries.length, 1); // exactly one provenance, never two
    } finally {
      child.close();
    }
  } finally {
    cleanup();
  }
});

test("the child is an individual: writes to either side never touch the other", () => {
  const { store, dir, cleanup } = tempStore();
  try {
    store.store("Origin memory.", { metadata: { kind: "note" } });
    const result = store.fork(join(dir, "fork.db"));

    const child = Store.open({ dbPath: result.path });
    try {
      child.store("The child's own lived experience.", { metadata: { kind: "note" } });
      child.deprecate(child.list({ where: "metadata->>'$.kind' = 'note'", limit: 1 })[0].id);
    } finally {
      child.close();
    }
    // Parent unchanged: still one note + no deprecated statuses.
    const notes = store.list({ where: "metadata->>'$.kind' = 'note'", limit: 10 });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].status, "active");
    // And a later parent write never appears in the already-born child.
    store.store("Born after the fork.", { metadata: { kind: "note" } });
    const child2 = Store.open({ dbPath: result.path });
    try {
      assert.equal(
        child2.list({ limit: 100 }).some((m) => m.content.includes("Born after the fork")),
        false,
      );
    } finally {
      child2.close();
    }
  } finally {
    cleanup();
  }
});

test("fork works from a read-only open — an archive is forked without waking it", () => {
  const { store, dir, cleanup } = tempStore();
  try {
    store.store("Archived memory.", { metadata: { kind: "note" } });
    store.close();

    const archive = Store.open({ dbPath: join(dir, "memory.db"), readOnly: true });
    try {
      const result = archive.fork(join(dir, "reborn.db"));
      assert.equal(result.memories, 1);
      const child = Store.open({ dbPath: result.path });
      try {
        assert.equal(child.list({ limit: 100 }).length, 2); // inherited + provenance
      } finally {
        child.close();
      }
    } finally {
      archive.close();
    }
  } finally {
    cleanup();
  }
});

test("fork captures WAL-committed writes immediately — no checkpoint needed", () => {
  const { store, dir, cleanup } = tempStore();
  try {
    store.store("Committed into the WAL, copied anyway.", { metadata: { kind: "note" } });
    const result = store.fork(join(dir, "fork.db"));
    const child = Store.open({ dbPath: result.path });
    try {
      const found = child
        .list({ limit: 100 })
        .some((m) => m.content.includes("Committed into the WAL"));
      assert.equal(found, true);
    } finally {
      child.close();
    }
  } finally {
    cleanup();
  }
});
