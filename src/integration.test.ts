import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("integration: full end-to-end flow against a temp DB", () => {
  const { store, cleanup } = tempStore();
  try {
    // 1. Open a fresh store — already done via tempStore()
    assert.equal(store.stats().memories, 0, "fresh store should be empty");

    // 2. Store three memories with metadata (tags, kind)
    const a = store.store("The quick brown fox jumps over the lazy dog", {
      metadata: { tags: ["animal", " canine"], kind: "note" },
    });
    const b = store.store("Hello world from the fox convention", {
      metadata: { tags: ["greeting"], kind: "log" },
    });
    const c = store.store("A lazy dog sleeps peacefully", {
      metadata: { tags: ["animal"], kind: "note" },
    });

    assert.equal(store.stats().memories, 3, "should have 3 memories stored");

    // 3. Link two of them with a references relation
    store.link(a, b, "references");
    assert.equal(store.stats().edges, 1, "should have 1 edge");

    // 4. Search for a keyword and assert the right memory ranks first
    //    "fox" appears in both a and b, but a has it more prominently
    const foxResults = store.search("fox");
    assert.ok(foxResults.length >= 2, "should find at least 2 memories with 'fox'");
    assert.ok(
      foxResults[0]!.content.toLowerCase().includes("fox"),
      "top result should contain 'fox'",
    );

    // Search for a unique keyword to get a deterministic top result
    const dogResults = store.search("dog");
    assert.ok(dogResults.length >= 2, "should find at least 2 memories with 'dog'");
    // "lazy dog" appears in c's content literally, and "lazy dog" in a's content
    // bm25 should rank the one with the keyword more prominently
    const peacefulResults = store.search("peacefully");
    assert.equal(peacefulResults.length, 1, "should find exactly 1 memory with 'peacefully'");
    assert.equal(peacefulResults[0]!.id, c, "the peaceful memory should be c");

    // 5. List with a metadata filter and assert the right subset
    const notes = store.list({ where: "metadata->>'$.kind' = 'note'" });
    assert.equal(notes.length, 2, "should find 2 notes");
    for (const m of notes) {
      assert.equal(m.metadata?.["kind"], "note");
    }

    const logs = store.list({ where: "metadata->>'$.kind' = 'log'" });
    assert.equal(logs.length, 1, "should find 1 log");
    assert.equal(logs[0]!.id, b, "the log should be memory b");

    // 6. Relations on a memory and assert the edge
    const aRelations = store.relations(a, { direction: "out" });
    assert.equal(aRelations.length, 1, "a should have 1 outgoing relation");
    assert.equal(aRelations[0]!.from_id, a);
    assert.equal(aRelations[0]!.to_id, b);
    assert.equal(aRelations[0]!.kind, "references");

    const bRelations = store.relations(b, { direction: "in" });
    assert.equal(bRelations.length, 1, "b should have 1 incoming relation");
    assert.equal(bRelations[0]!.from_id, a);
    assert.equal(bRelations[0]!.to_id, b);
    assert.equal(bRelations[0]!.kind, "references");

    // 7. Get an unknown id and assert the documented error behavior
    const unknown = store.get("nonexistent-id-12345");
    assert.equal(unknown, null, "get on unknown id should return null");

    // 8. Delete a memory and assert its edges cascade away
    store.delete(a);
    assert.equal(store.stats().memories, 2, "should have 2 memories after deleting a");
    assert.equal(store.stats().edges, 0, "edges should cascade away when a is deleted");

    // Verify the edge is truly gone
    const bRelationsAfterDelete = store.relations(b, { direction: "in" });
    assert.equal(bRelationsAfterDelete.length, 0, "b should have no incoming relations after a is deleted");

    // Verify a is no longer searchable (FTS cascade)
    const foxAfterDelete = store.search("fox");
    assert.equal(foxAfterDelete.length, 1, "only b should remain with 'fox'");
    assert.equal(foxAfterDelete[0]!.id, b);

    // 9. Stats and assert the counts
    const finalStats = store.stats();
    assert.equal(finalStats.memories, 2);
    assert.equal(finalStats.edges, 0);
    assert.deepEqual(finalStats.edges_by_kind, {});
  } finally {
    cleanup();
  }
});

test("integration: CLI-reachable end-to-end via execSync", async () => {
  const { execSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-cli-test-"));
  const dbPath = join(dir, "memory.db");
  const bin = join(process.cwd(), "bin", "memory.js");

  function run(args: string): string {
    return execSync(`node ${bin} --db ${dbPath} ${args}`, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
  }

  function runExpectError(args: string): { stderr: string; code: number } {
    try {
      execSync(`node ${bin} --db ${dbPath} ${args}`, {
        encoding: "utf-8",
        timeout: 10000,
        stdio: "pipe",
      });
      assert.fail("expected non-zero exit code");
    } catch (err) {
      const e = err as { stderr: string; status: number };
      return { stderr: e.stderr.trim(), code: e.status };
    }
  }

  try {
    // store three memories
    const a = run(`store "The quick brown fox" --metadata '{"kind":"note","tags":["animal"]}'`);
    const b = run(`store "Hello from the fox club" --metadata '{"kind":"log","tags":["greeting"]}'`);
    const c = run(`store "A lazy dog sleeps" --metadata '{"kind":"note","tags":["animal"]}'`);
    assert.ok(a.length > 0, "store should print an id");
    assert.ok(b.length > 0);
    assert.ok(c.length > 0);

    // link a -> b
    run(`link ${a} ${b} --kind references`);

    // search for "fox" — should find a and b, with a or b ranking first
    const searchResults = JSON.parse(run(`search fox`));
    assert.ok(searchResults.length >= 2, "should find at least 2 results for 'fox'");

    // list with metadata filter
    const notes = JSON.parse(run(`list --where "metadata->>'$.kind' = 'note'"`));
    assert.equal(notes.length, 2, "should find 2 notes via CLI");

    // tags command — should return tag counts
    const tagsResult = JSON.parse(run(`tags`));
    assert.ok(Array.isArray(tagsResult), "tags should return an array");
    const tagsMap = new Map(tagsResult.map((r: { tag: string; count: number }) => [r.tag, r.count]));
    assert.equal(tagsMap.get("animal"), 2, "animal tag should have count 2");
    assert.equal(tagsMap.get("greeting"), 1, "greeting tag should have count 1");

    // tags with --where filter
    const tagsNotesOnly = JSON.parse(run(`tags --where "metadata->>'$.kind' = 'note'"`));
    const tagsNotesMap = new Map(tagsNotesOnly.map((r: { tag: string; count: number }) => [r.tag, r.count]));
    assert.equal(tagsNotesMap.get("animal"), 2, "animal in notes");
    assert.equal(tagsNotesMap.get("greeting"), undefined, "greeting not in notes");

    // supersede a memory
    const d = run(`store "original content" --metadata '{"kind":"note","tags":["draft"]}'`);
    const supersededId = run(`supersede ${d} --content "revised content" --metadata '{"kind":"note","tags":["final"]}'`);
    assert.ok(supersededId.length > 0, "supersede should print new id");

    // deprecate a memory
    const e = run(`store "to be deprecated"`);
    run(`deprecate ${e}`);

    // merge two memories
    const f = run(`store "merge candidate one" --metadata '{"kind":"note","tags":["duplicate"]}'`);
    const g = run(`store "merge candidate two" --metadata '{"kind":"note","tags":["duplicate"]}'`);
    const mergedId = run(`merge ${f} ${g} --content "merged result" --metadata '{"kind":"note","tags":["merged"]}'`);
    assert.ok(mergedId.length > 0, "merge should print new id");

    // search defaults to active only — superseded original should not appear
    const activeResults = JSON.parse(run(`search "original"`));
    assert.equal(activeResults.length, 0, "superseded memory should not appear in default search");

    // search with --all includes superseded memory
    const allResults = JSON.parse(run(`search "original" --all`));
    assert.ok(allResults.length >= 1, "superseded memory should appear with --all");

    // delete without --force should fail
    const deleteErr = runExpectError(`delete ${b}`);
    assert.equal(deleteErr.code, 1);
    assert.ok(deleteErr.stderr.includes("deprecate"), `stderr should suggest deprecate, got: ${deleteErr.stderr}`);

    // relations
    const aRels = JSON.parse(run(`relations ${a} --direction out`));
    assert.equal(aRels.length, 1);
    assert.equal(aRels[0].kind, "references");
    assert.equal(aRels[0].to_id, b);

    // get unknown id — should exit 1 with stderr message
    const errResult = runExpectError(`get nonexistent-id`);
    assert.equal(errResult.code, 1);
    assert.ok(errResult.stderr.includes("not found"), `stderr should say 'not found', got: ${errResult.stderr}`);

    // delete a — cascade edges
    run(`delete ${a} --force`);
    const stats = JSON.parse(run(`stats`));
    assert.equal(stats.memories, 8);
    assert.equal(stats.edges, 3, "supersedes + 2 merges edges remain after a deleted");

    // verify a is gone via get
    const errResult2 = runExpectError(`get ${a}`);
    assert.equal(errResult2.code, 1);
    assert.ok(errResult2.stderr.includes("not found"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
