import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";
import { slugify, filenameFor, renderFrontmatter, rewriteLinks, renderRelations, renderMemory } from "./export.ts";
import type { Memory, Relation } from "./types.ts";

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "51f808a7-aaaa-bbbb-cccc-dddddddddddd",
    content: "The Store class in src/db.ts is the core of the library.",
    metadata: { kind: "note", tags: ["api", "store"] },
    created_at: "2026-01-15T10:30:00.000Z",
    status: "active",
    weight: 0.5,
    access_count: 0,
    ...overrides,
  };
}

test("slugify: first sentence of content", () => {
  assert.equal(
    slugify("The Store class in src/db.ts is the core of the library. More text here."),
    "the-store-class-in-src-db-ts-is-the-core-of-the",
  );
});

test("slugify: uses header if present", () => {
  assert.equal(
    slugify("# Dream: The Second Dream\n\n## Date\n2026-08-26"),
    "dream-the-second-dream",
  );
});

test("slugify: truncates at 50 chars on word boundary", () => {
  const long = "This is a very long sentence that goes well beyond fifty characters in total length";
  const slug = slugify(long);
  assert.ok(slug.length <= 50, `slug too long: ${slug.length}`);
  assert.ok(!slug.endsWith("-"), `slug should not end with hyphen: ${slug}`);
});

test("slugify: NFD normalizes accented chars", () => {
  assert.equal(
    slugify("Café au lait avec crème"),
    "cafe-au-lait-avec-creme",
  );
});

test("slugify: empty content returns 'empty'", () => {
  assert.equal(slugify(""), "empty");
});

test("slugify: whitespace-only returns 'empty'", () => {
  assert.equal(slugify("   \n\t  "), "empty");
});

test("slugify: URL-only content", () => {
  assert.equal(slugify("https://example.com/foo"), "https-example-com-foo");
});

test("slugify: memory link only returns 'memory'", () => {
  assert.equal(slugify("memory://51f808a7-aaaa-bbbb-cccc-dddddddddddd"), "memory");
});

test("slugify: symbols only return 'untitled'", () => {
  assert.equal(slugify("!@#$%^&*()"), "untitled");
});

test("filenameFor: uuid prefix + slug", () => {
  const mem = makeMemory();
  const filename = filenameFor(mem);
  assert.ok(filename.startsWith("51f808a7-"));
  assert.ok(filename.endsWith(".md"));
  assert.ok(filename.includes("the-store-class"));
});

test("renderFrontmatter: basic memory with kind and tags", () => {
  const mem = makeMemory();
  const fm = renderFrontmatter(mem);
  assert.ok(fm.startsWith("---\n"));
  assert.ok(fm.endsWith("\n---"));
  assert.ok(fm.includes("id: 51f808a7-aaaa-bbbb-cccc-dddddddddddd"));
  assert.ok(fm.includes("kind: note"));
  assert.ok(fm.includes("tags:"));
  assert.ok(fm.includes("- api"));
  assert.ok(fm.includes("- store"));
  assert.ok(fm.includes("status: active"));
  assert.ok(fm.includes("created_at: 2026-01-15T10:30:00.000Z"));
  assert.ok(fm.includes("weight: 0.5"));
  assert.ok(fm.includes("access_count: 0"));
  assert.ok(!fm.includes("metadata:"));
});

test("renderFrontmatter: extra metadata keys nest under metadata:", () => {
  const mem = makeMemory({
    metadata: { kind: "decision", tags: ["api"], domain: "auth", weight: 5 },
  });
  const fm = renderFrontmatter(mem);
  assert.ok(fm.includes("kind: decision"));
  assert.ok(fm.includes("metadata:"));
  assert.ok(fm.includes("domain: auth"));
  assert.ok(fm.includes("weight: 5"));
});

test("renderFrontmatter: null metadata omits kind, tags, metadata", () => {
  const mem = makeMemory({ metadata: null });
  const fm = renderFrontmatter(mem);
  assert.ok(!fm.includes("kind:"));
  assert.ok(!fm.includes("tags:"));
  assert.ok(!fm.includes("metadata:"));
  assert.ok(fm.includes("id:"));
  assert.ok(fm.includes("status:"));
  assert.ok(fm.includes("created_at:"));
});

test("rewriteLinks: replaces memory:// links with markdown links", () => {
  const idToFilename = new Map([
    ["51f808a7-aaaa-bbbb-cccc-dddddddddddd", "51f808a7-the-store.md"],
  ]);
  const content = "See memory://51f808a7-aaaa-bbbb-cccc-dddddddddddd for details.";
  const result = rewriteLinks(content, idToFilename);
  assert.ok(result.includes("[the-store](./51f808a7-the-store.md)"));
  assert.ok(!result.includes("memory://51f808a7"));
});

test("rewriteLinks: leaves broken links as memory://", () => {
  const idToFilename = new Map();
  const content = "See memory://99999999-aaaa-bbbb-cccc-dddddddddddd for details.";
  const result = rewriteLinks(content, idToFilename);
  assert.ok(result.includes("memory://99999999-aaaa-bbbb-cccc-dddddddddddd"));
});

test("renderRelations: outgoing and incoming sections", () => {
  const memId = "51f808a7-aaaa-bbbb-cccc-dddddddddddd";
  const otherId = "99999999-aaaa-bbbb-cccc-dddddddddddd";
  const idToFilename = new Map([
    [memId, "51f808a7-the-store.md"],
    [otherId, "99999999-other.md"],
  ]);
  const relations: Relation[] = [
    { from_id: memId, to_id: otherId, kind: "references", metadata: null, created_at: "2026-01-15T10:30:00.000Z" },
    { from_id: otherId, to_id: memId, kind: "extends", metadata: null, created_at: "2026-01-15T10:30:00.000Z" },
  ];
  const result = renderRelations(relations, memId, idToFilename);
  assert.ok(result.includes("## Relations"));
  assert.ok(result.includes("### Outgoing"));
  assert.ok(result.includes("- references → [other](./99999999-other.md)"));
  assert.ok(result.includes("### Incoming"));
  assert.ok(result.includes("- extends ← [other](./99999999-other.md)"));
});

test("renderRelations: no relations returns empty string", () => {
  const result = renderRelations([], "51f808a7-aaaa-bbbb-cccc-dddddddddddd", new Map());
  assert.equal(result, "");
});

test("renderRelations: target not in export shows raw UUID", () => {
  const memId = "51f808a7-aaaa-bbbb-cccc-dddddddddddd";
  const otherId = "99999999-aaaa-bbbb-cccc-dddddddddddd";
  const idToFilename = new Map([[memId, "51f808a7-the-store.md"]]);
  const relations: Relation[] = [
    { from_id: memId, to_id: otherId, kind: "references", metadata: null, created_at: "2026-01-15T10:30:00.000Z" },
  ];
  const result = renderRelations(relations, memId, idToFilename);
  assert.ok(result.includes("memory://99999999-aaaa-bbbb-cccc-dddddddddddd (not in export)"));
});

test("renderMemory: full file with frontmatter, body, relations", () => {
  const memId = "51f808a7-aaaa-bbbb-cccc-dddddddddddd";
  const otherId = "99999999-aaaa-bbbb-cccc-dddddddddddd";
  const idToFilename = new Map([
    [memId, "51f808a7-the-store.md"],
    [otherId, "99999999-other.md"],
  ]);
  const mem = makeMemory({
    content: "See memory://99999999-aaaa-bbbb-cccc-dddddddddddd for details.",
  });
  const relations: Relation[] = [
    { from_id: memId, to_id: otherId, kind: "references", metadata: null, created_at: "2026-01-15T10:30:00.000Z" },
  ];
  const result = renderMemory(mem, relations, idToFilename);
  assert.ok(result.startsWith("---\n"));
  assert.ok(result.includes("[other](./99999999-other.md)"));
  assert.ok(result.includes("## Relations"));
  assert.ok(result.includes("### Outgoing"));
  assert.ok(result.endsWith("\n"));
});

test("renderMemory: no relations omits Relations section", () => {
  const mem = makeMemory();
  const result = renderMemory(mem, [], new Map());
  assert.ok(!result.includes("## Relations"));
});

test("renderMemory: empty content produces frontmatter + empty body", () => {
  const mem = makeMemory({ content: "" });
  const result = renderMemory(mem, [], new Map());
  assert.ok(result.startsWith("---\n"));
  assert.ok(result.includes("---\n\n\n"));
});

test("dump: yields all memories lazily", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("Memory one", { metadata: { kind: "note" } });
    store.store("Memory two", { metadata: { kind: "note" } });
    store.store("Memory three", { metadata: { kind: "note" } });

    const { memories } = store.dump();
    const all = [...memories];
    assert.equal(all.length, 3);
    assert.ok(all.every((m) => m.content.startsWith("Memory")));
  } finally {
    cleanup();
  }
});

test("dump: yields all edges lazily", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("Memory A", { metadata: {} });
    const b = store.store("Memory B", { metadata: {} });
    store.link(a, b, "references");

    const { edges } = store.dump();
    const all = [...edges];
    assert.equal(all.length, 1);
    assert.equal(all[0].from_id, a);
    assert.equal(all[0].to_id, b);
    assert.equal(all[0].kind, "references");
  } finally {
    cleanup();
  }
});

test("dump: yields memories with all statuses", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("Active one", { metadata: {} });
    const old = store.store("Old memory", { metadata: {} });
    store.deprecate(old);

    const { memories } = store.dump();
    const all = [...memories];
    assert.equal(all.length, 2);
    const statuses = all.map((m) => m.status).sort();
    assert.deepEqual(statuses, ["active", "deprecated"]);
  } finally {
    cleanup();
  }
});

test("dump: empty store yields nothing", () => {
  const { store, cleanup } = tempStore();
  try {
    const { memories, edges } = store.dump();
    assert.equal([...memories].length, 0);
    assert.equal([...edges].length, 0);
  } finally {
    cleanup();
  }
});

test("dump: iterators are independent", () => {
  const { store, cleanup } = tempStore();
  try {
    store.store("Memory one", { metadata: {} });
    store.store("Memory two", { metadata: {} });

    const { memories } = store.dump();
    const first = [...memories];
    const second = [...memories];
    assert.equal(first.length, 2);
    assert.equal(second.length, 0, "iterator already consumed");
  } finally {
    cleanup();
  }
});

test("export CLI: writes one md file per memory", () => {
  const { store, cleanup } = tempStore();
  try {
    const a = store.store("The quick brown fox", { metadata: { kind: "note", tags: ["animal"] } });
    const b = store.store("Hello world from the fox", { metadata: { kind: "log" } });
    store.link(a, b, "references");

    const outputDir = join(tmpdir(), "souvenance-export-test-" + process.pid);
    rmSync(outputDir, { recursive: true, force: true });

    const { memories, edges } = store.dump();
    const edgesByMemory = new Map<string, Relation[]>();
    for (const edge of edges) {
      if (!edgesByMemory.has(edge.from_id)) edgesByMemory.set(edge.from_id, []);
      if (!edgesByMemory.has(edge.to_id)) edgesByMemory.set(edge.to_id, []);
      edgesByMemory.get(edge.from_id)!.push(edge);
      edgesByMemory.get(edge.to_id)!.push(edge);
    }
    const idToFilename = new Map<string, string>();
    const memArray = [...memories];
    for (const mem of memArray) {
      idToFilename.set(mem.id, filenameFor(mem));
    }
    for (const mem of memArray) {
      const rels = edgesByMemory.get(mem.id) ?? [];
      const markdown = renderMemory(mem, rels, idToFilename);
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, idToFilename.get(mem.id)!), markdown);
    }

    const files = readdirSync(outputDir);
    assert.equal(files.length, 2);
    for (const f of files) {
      assert.ok(f.endsWith(".md"));
      const content = readFileSync(join(outputDir, f), "utf-8");
      assert.ok(content.startsWith("---\n"));
    }

    rmSync(outputDir, { recursive: true, force: true });
  } finally {
    cleanup();
  }
});

test("export: a metadata key containing decorative characters cannot inject frontmatter fields", () => {
  const memory: Memory = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    content: "a hostile metadata shape",
    metadata: { kind: "note", "bad\ninjected: forged": "yes", "colon: key": 1 },
    created_at: new Date().toISOString(),
    status: "active",
    weight: 0.5,
    access_count: 0,
  };
  const frontmatter = renderFrontmatter(memory);
  assert.doesNotMatch(frontmatter, /^injected:/m, "no injected top-level field");
  assert.ok(frontmatter.includes('"bad\\ninjected: forged"'), "the rogue key is double-quoted");
  assert.ok(frontmatter.includes('"colon: key"'), "the colon key is quoted too");
});
