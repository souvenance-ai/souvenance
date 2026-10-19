import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "./db.ts";

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ai-memory-finish-test-"));
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
 * A fully closed session: linked working memories plus the closing trio —
 * summary, experience note (tagged evaluation), dream — all fresh and all
 * linked (an isolated closer would be a doctor finding, not a finish one).
 * finish reports zero findings on it; every obligation test starts here and
 * removes exactly one thing, so the expected findings array is the check's
 * full contract, not just its presence.
 */
function closedSession(store: Store): { a: string; b: string; summary: string; note: string; dream: string } {
  const a = store.store("# Memory alpha\n\nBody alpha.\n\nKeywords: alpha, test.", {
    metadata: { kind: "note" },
    weight: 0.5,
  });
  const b = store.store("# Memory beta\n\nBody beta.\n\nKeywords: beta, test.", {
    metadata: { kind: "note" },
    weight: 0.5,
  });
  const summary = store.store("# Summary: the arc closed\n\nDone.\n\nKeywords: summary, test.", {
    metadata: { kind: "summary" },
    weight: 0.85,
  });
  const note = store.store("# Note: experience of the session\n\nHits.\n\nKeywords: note, evaluation.", {
    metadata: { kind: "note", tags: ["evaluation"] },
    weight: 0.6,
  });
  const dream = store.store("# Dream: pattern\n\nPattern.\n\nKeywords: dream, test.", {
    metadata: { kind: "dream" },
    weight: 0.7,
  });
  store.link(a, b, "references");
  store.link(summary, a, "references");
  store.link(note, summary, "references");
  store.link(dream, summary, "references");
  return { a, b, summary, note, dream };
}

test("finish: a fresh empty store is closable — nothing owed, nothing blocked", () => {
  const { store, cleanup } = tempStore();
  try {
    const report = store.finish();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.window_hours, 24);
    assert.equal(report.summary.window_memories, 0);
    assert.equal(report.summary.last_dream, null);
    assert.equal(report.summary.memories_since_dream, 0);
    assert.equal(report.summary.blocks, 0);
    assert.equal(report.summary.warns, 0);
    assert.equal(report.summary.doctor.checks, 10);
    assert.equal(report.summary.doctor.issues, 0);
  } finally {
    cleanup();
  }
});

test("finish: a fully closed session reports healthy with zero findings", () => {
  const { store, cleanup } = tempStore();
  try {
    closedSession(store);
    const report = store.finish();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.window_memories, 5);
    assert.equal(report.summary.blocks, 0);
    assert.equal(report.summary.warns, 0);
    assert.equal(report.summary.memories_since_dream, 0);
    assert.ok(report.summary.last_dream !== null);
  } finally {
    cleanup();
  }
});

test("finish: a session that stored memories without its summary and note is not closable", () => {
  const { store, cleanup } = tempStore();
  try {
    // Remove exactly the closing trio (cascade removes their edges): the
    // linked working memories stay — a session that worked and never closed.
    const { summary, note, dream } = closedSession(store);
    store.delete(summary);
    store.delete(note);
    store.delete(dream);
    assert.equal(store.stats().memories, 2);
    assert.equal(store.stats().edges, 1);

    const report = store.finish();
    assert.equal(report.healthy, false);
    assert.equal(report.findings.length, 3);
    assert.deepEqual(
      report.findings.map((f) => [f.check, f.severity]),
      [
        ["session_summary", "block"],
        ["experience_note", "block"],
        ["dream_debt", "warn"], // young store, no dream yet — judgment debt, not a block
      ],
    );
    assert.equal(report.summary.blocks, 2);
    assert.equal(report.summary.warns, 1);
    assert.equal(report.summary.window_memories, 2);
  } finally {
    cleanup();
  }
});

test("finish: the dream volume line blocks — 10 memories since the last dream", () => {
  const { store, cleanup } = tempStore();
  try {
    const { dream } = closedSession(store);
    // Backdate the dream outside the window: everything after it accumulates.
    store.db
      .prepare("UPDATE memories SET created_at = ? WHERE id = ?")
      .run("2020-01-01T00:00:00.000Z", dream);
    for (let i = 0; i < 10; i++) {
      const id = store.store(`# Memory tail ${i}\n\nBody.\n\nKeywords: tail, test.`, {
        metadata: { kind: "note" },
        weight: 0.5,
      });
      store.link(id, dream, "references");
    }

    const report = store.finish();
    assert.equal(report.healthy, false);
    const debt = report.findings.filter((f) => f.check === "dream_debt");
    assert.equal(debt.length, 1);
    assert.equal(debt[0].severity, "block");
    assert.equal(
      debt[0].detail,
      "14 memories stored since the last dream (2020-01-01T00:00:00.000Z) — the volume line passed",
    );
    assert.equal(report.summary.memories_since_dream, 14);
    assert.ok(report.summary.last_dream !== null);
  } finally {
    cleanup();
  }
});

test("finish: the session-end clause warns without blocking — the dream is the agent's judgment", () => {
  const { store, cleanup } = tempStore();
  try {
    const { dream } = closedSession(store);
    store.db
      .prepare("UPDATE memories SET created_at = ? WHERE id = ?")
      .run("2020-01-01T00:00:00.000Z", dream);
    // Two fresh linked memories after the old dream; summary and note stay
    // fresh, so ONLY the dream debt surfaces.
    const c = store.store("# Memory gamma\n\nBody gamma.\n\nKeywords: gamma, test.", {
      metadata: { kind: "note" },
      weight: 0.5,
    });
    store.link(c, dream, "references");

    const report = store.finish();
    assert.equal(report.healthy, true);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "dream_debt");
    assert.equal(report.findings[0].severity, "warn");
    assert.match(report.findings[0].detail, /session-end clause fired/);
    assert.equal(report.summary.blocks, 0);
    assert.equal(report.summary.warns, 1);
    assert.equal(report.summary.memories_since_dream, 5);
  } finally {
    cleanup();
  }
});

test("finish: a doctor finding blocks the verdict — the gate composes", () => {
  const { store, cleanup } = tempStore();
  try {
    closedSession(store);
    // One defect: an isolated active memory (doctor's finding, not finish's).
    store.store("# Memory orphe\n\nIsland body.\n\nKeywords: orphan, test.", {
      metadata: { kind: "note" },
      weight: 0.5,
    });

    const report = store.finish();
    assert.equal(report.healthy, false);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "isolated_active");
    assert.equal(report.findings[0].severity, "block");
    assert.equal(report.summary.doctor.issues, 1);
    assert.equal(report.summary.blocks, 1);
    // The session obligations themselves were met: no session_* findings.
    assert.ok(report.findings.every((f) => !f.check.startsWith("session_") && f.check !== "experience_note"));
  } finally {
    cleanup();
  }
});
