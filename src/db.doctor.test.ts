import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-doctor-test-"));
  const store = Store.open({ dbPath: join(dir, "memory.db") });
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Baseline of two healthy active memories (distinct titles, kind, weight,
 * linked): doctor reports zero findings on it. Every corruption test starts
 * here and applies exactly one defect — so the expected findings array is
 * the check's full contract, not just its presence.
 */
function healthyPair(store: Store): { a: string; b: string } {
  const a = store.store(
    "# Memory alpha\n\nBody alpha.\n\nKeywords: alpha, test.",
    { metadata: { kind: "note" }, weight: 0.5 },
  );
  const b = store.store(
    "# Memory beta\n\nBody beta.\n\nKeywords: beta, test.",
    { metadata: { kind: "note" }, weight: 0.5 },
  );
  store.link(a, b, "references");
  return { a, b };
}

/** Mirrors migrations.ts — restores the delete trigger a test drops. */
const AD_TRIGGER = `
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
`;

test("doctor: a healthy pair has zero findings and coherent summary", () => {
  const { store, cleanup } = tempStore();
  try {
    healthyPair(store);
    const report = store.doctor();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.checks, 10);
    assert.equal(report.summary.issues, 0);
    assert.equal(report.summary.memories, 2);
    assert.equal(report.summary.edges, 1);
    assert.deepEqual(report.summary.edges_by_kind, { references: 1 });
    assert.equal(report.summary.active_to_superseded, 0);
    assert.equal(report.summary.fts_rebuilt, false);
  } finally {
    cleanup();
  }
});

test("doctor: an empty fresh store is healthy", () => {
  const { store, cleanup } = tempStore();
  try {
    const report = store.doctor();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.memories, 0);
  } finally {
    cleanup();
  }
});

test("doctor: broken_links finds a content reference to a missing memory", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    const ghost = "00000000-0000-4000-8000-000000000000";
    store.db
      .prepare("UPDATE memories SET content = content || ? WHERE id = ?")
      .run(`\n\nSee memory://${ghost}.`, a);
    const report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "broken_links");
    assert.equal(report.findings[0].id, a);
    assert.match(report.findings[0].detail, new RegExp(ghost));
    assert.ok(report.findings[0].hint.length > 0);
  } finally {
    cleanup();
  }
});

test("doctor: orphan_edges finds an edge row with a missing endpoint", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    const ghost = "00000000-0000-4000-8000-000000000001";
    // Hand-edit scenario: FK enforcement off while the bad row lands.
    store.db.exec("PRAGMA foreign_keys = OFF");
    store.db
      .prepare(
        "INSERT INTO edges (from_id, to_id, kind, metadata, created_at)" +
          " VALUES (?, ?, 'references', NULL, ?)",
      )
      .run(a, ghost, new Date().toISOString());
    store.db.exec("PRAGMA foreign_keys = ON");
    const report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "orphan_edges");
    assert.equal(report.findings[0].id, undefined);
    assert.match(report.findings[0].detail, new RegExp(ghost));
  } finally {
    cleanup();
  }
});

test("doctor: active_without_kind finds null metadata and kindless metadata", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    store.db.prepare("UPDATE memories SET metadata = NULL WHERE id = ?").run(a);
    store.db
      .prepare("UPDATE memories SET metadata = '{\"tags\":[]}' WHERE id = ?")
      .run(b);
    const report = store.doctor();
    assert.equal(report.findings.length, 2);
    for (const f of report.findings) {
      assert.equal(f.check, "active_without_kind");
      assert.ok([a, b].includes(f.id!));
    }
  } finally {
    cleanup();
  }
});

test("doctor: weight_bounds finds out-of-range and below-floor directive weights", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    store.db.prepare("UPDATE memories SET weight = 1.5 WHERE id = ?").run(a);
    store.db
      .prepare("UPDATE memories SET metadata = '{\"kind\":\"directive\"}' WHERE id = ?")
      .run(b);
    const report = store.doctor();
    assert.equal(report.findings.length, 2);
    for (const f of report.findings) {
      assert.equal(f.check, "weight_bounds");
      assert.ok([a, b].includes(f.id!));
    }
    assert.match(report.findings[1].detail, /below the 0.8 floor/);
  } finally {
    cleanup();
  }
});

test("doctor: invalid_metadata_json is one finding per root cause (no kindless echo)", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    store.db.prepare("UPDATE memories SET metadata = 'not json' WHERE id = ?").run(a);
    const report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "invalid_metadata_json");
    assert.equal(report.findings[0].id, a);
  } finally {
    cleanup();
  }
});

test("doctor: status_without_bridge finds a hand-edited superseded status", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    store.db
      .prepare("UPDATE memories SET status = 'superseded' WHERE id = ?")
      .run(a);
    const report = store.doctor();
    // CLI-created supersede always leaves a bridge; a bare status flip has none.
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "status_without_bridge");
    assert.equal(report.findings[0].id, a);
    // The superseded memory's outgoing reference (superseded -> active) is
    // normal history, resolved at read time: not a finding, not counted in
    // active_to_superseded (that tallies active SOURCES pointing at
    // superseded targets).
    assert.equal(report.summary.active_to_superseded, 0);
  } finally {
    cleanup();
  }
});

test("doctor: isolated_active finds a linked-nothing active memory", () => {
  const { store, cleanup } = tempStore();
  try {
    healthyPair(store);
    const c = store.store("# Memory gamma\n\nBody gamma.\n\nKeywords: gamma.", {
      metadata: { kind: "note" },
    });
    const report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "isolated_active");
    assert.equal(report.findings[0].id, c);
  } finally {
    cleanup();
  }
});

test("doctor: duplicate_titles groups identical active headings only", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // Positive: a third active with the exact same first-line heading as a.
    const c = store.store("# Memory alpha\n\nBody clone.\n\nKeywords: clone.", {
      metadata: { kind: "note" },
    });
    store.link(b, c, "references");
    let report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "duplicate_titles");
    assert.match(report.findings[0].detail, new RegExp(a));
    assert.match(report.findings[0].detail, new RegExp(c));

    // Negative control 1: a superseded predecessor sharing the title is
    // history, not a duplicate — supersede 'a' with a distinct title and the
    // active-title clash disappears entirely.
    const successor = store.supersede(
      a,
      "# Memory alpha-prime\n\nBody rewritten.\n\nKeywords: alpha.",
    );
    report = store.doctor();
    assert.equal(report.findings.length, 0);
    assert.equal(report.summary.active_to_superseded, 0);
    assert.ok(successor);

    // Negative control 2: heading-less actives never group.
    const d = store.store("Plain first line one.\n\nKeywords: d.", {
      metadata: { kind: "note" },
    });
    const e = store.store("Plain first line two.\n\nKeywords: e.", {
      metadata: { kind: "note" },
    });
    store.link(d, e, "references");
    report = store.doctor();
    assert.equal(report.findings.length, 0);
  } finally {
    cleanup();
  }
});

test("doctor: fts_integrity detects drift and --fix rebuilds the index", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // A third memory keeps b linked, so the only defect below is the index:
    // hand-deleting a cascades its edges, but b still holds c -> b.
    const c = store.store("# Memory gamma\n\nBody gamma.\n\nKeywords: gamma.", {
      metadata: { kind: "note" },
    });
    store.link(c, b, "references");
    // Corrupt like a hand edit: delete bypassing the FTS delete trigger,
    // leaving a ghost rowid in the index.
    store.db.exec("DROP TRIGGER memories_ad");
    store.db.prepare("DELETE FROM memories WHERE id = ?").run(a);
    store.db.exec(AD_TRIGGER);

    let report = store.doctor();
    assert.equal(report.healthy, false);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "fts_integrity");
    assert.match(report.findings[0].hint, /--fix/);

    report = store.doctor({ fix: true });
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.fts_rebuilt, true);
  } finally {
    cleanup();
  }
});

test("doctor: objective memories carry the 0.8 weight floor too", () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    const o = store.store("# Objective alpha\n\nStanding intent.\n\nKeywords: objective.", {
      metadata: { kind: "objective", state: "open" },
      weight: 0.7,
    });
    store.link(a, o, "references");
    let report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "weight_bounds");
    assert.equal(report.findings[0].id, o);
    assert.match(report.findings[0].detail, /objective with weight 0.7 below the 0.8 floor/);

    // Above the floor the finding disappears — 0.85 is the authored class.
    store.update(o, { weight: 0.85 });
    report = store.doctor();
    assert.equal(report.findings.length, 0);
  } finally {
    cleanup();
  }
});

test("doctor: stale_handoff flags a decision younger than the newest summary", () => {
  const { store, cleanup } = tempStore();
  try {
    healthyPair(store);
    const s = store.store("# Summary: arc one\n\nDone.\n\nKeywords: summary.", {
      metadata: { kind: "summary" },
    });
    // Freeze the summary in the past so the decision below is deterministically
    // younger — created_at compares as ISO strings.
    store.db
      .prepare("UPDATE memories SET created_at = '2026-10-16T08:00:00.000Z' WHERE id = ?")
      .run(s);
    let report = store.doctor();
    assert.ok(!report.findings.some((f) => f.check === "stale_handoff"));

    // The incident's shape: a decision lands AFTER the latest summary.
    const d = store.store("# Decision: later truth\n\nWhy.\n\nKeywords: decision.", {
      metadata: { kind: "decision" },
    });
    store.link(s, d, "references");
    report = store.doctor();
    const find = report.findings.find((f) => f.check === "stale_handoff");
    assert.ok(find);
    assert.match(find.detail, /newer than the newest summary/);
    assert.match(find.hint, /kind:"summary"/);

    // A healing summary (newer than the decision) clears it.
    store.store("# Summary: arc two\n\nRecapped.\n\nKeywords: summary.", {
      metadata: { kind: "summary" },
    });
    report = store.doctor();
    assert.ok(!report.findings.some((f) => f.check === "stale_handoff"));
  } finally {
    cleanup();
  }
});

test("doctor: stale_handoff skips summary-less stores (and suffers the post-summary note)", () => {
  const { store, cleanup } = tempStore();
  try {
    healthyPair(store);
    store.store("# Decision: bare truth\n\nWhy.\n\nKeywords: decision.", {
      metadata: { kind: "decision" },
    });
    // No summaries yet: the store has not adopted the handoff convention.
    let report = store.doctor();
    assert.ok(!report.findings.some((f) => f.check === "stale_handoff"));

    // Checklist shape: summary (step 1) then the experience note (step 2).
    // The note is confronted AFTER the summary on purpose, so truth for this
    // check is decisions only — the note must NOT re-flag it.
    const { b } = healthyPair(store);
    const s = store.store("# Summary: arc three\n\nDone.\n\nKeywords: summary.", {
      metadata: { kind: "summary" },
    });
    const n = store.store("# Evaluation: session note\n\nNote.\n\nKeywords: evaluation.", {
      metadata: { kind: "note", tags: ["evaluation"] },
    });
    store.link(b, s, "references");
    store.link(s, n, "references");
    report = store.doctor();
    assert.ok(!report.findings.some((f) => f.check === "stale_handoff"));
  } finally {
    cleanup();
  }
});
