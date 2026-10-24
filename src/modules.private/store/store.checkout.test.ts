import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'vitest';
import { CHECKOUT_CHECK_COUNT, Store } from './store.ts';

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-checkout-test-'));
  const store = Store.open({ dbPath: join(dir, 'memory.db') });
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A raw probe connection — the hand-SQL vantage. The store's own
 * connection is `#db`-private by design: corruption enters the file the
 * way it would in reality, from outside the library, on a second raw
 * connection.
 */
function probe(store: Store): DatabaseSync {
  const db = new DatabaseSync(store.dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/**
 * The healthy baseline: two linked actives, one of them hot. The checkout
 * reports zero findings on it. Every defect test starts here and applies
 * exactly one defect — so the expected findings array is the check's full
 * contract, not just its presence. The kinds are free tags (fixtures use
 * them for flavour, never because a check reads them).
 */
function healthyPair(store: Store): { a: string; b: string } {
  const a = store.store('# Memory alpha\n\nBody alpha.\n\nKeywords: alpha, test.', {
    metadata: { kind: 'note' },
  });
  const b = store.store('# Memory beta\n\nBody beta.\n\nKeywords: beta, test.', {
    metadata: { kind: 'note' },
  });
  store.link(a, b, 'references');
  store.setHot(a, true);
  return { a, b };
}

test('checkout: a healthy pair has zero findings and a coherent summary', () => {
  const { store, cleanup } = tempStore();
  try {
    healthyPair(store);
    const report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.checks, CHECKOUT_CHECK_COUNT);
    assert.equal(report.summary.issues, 0);
    assert.equal(report.summary.memories, 2);
    assert.equal(report.summary.hot_memories, 1);
    assert.equal(report.summary.edges, 1);
    assert.deepEqual(report.summary.edges_by_kind, { references: 1 });
  } finally {
    cleanup();
  }
});

test('checkout: an empty fresh store is green — nothing to serve, nothing owed', () => {
  const { store, cleanup } = tempStore();
  try {
    const report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.memories, 0);
    assert.equal(report.summary.hot_memories, 0);
  } finally {
    cleanup();
  }
});

test('checkout: orphan_edges finds an edge row with a missing endpoint', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    const ghost = '00000000-0000-4000-8000-000000000001';
    // Hand-edit scenario: FK enforcement off on the raw connection while
    // the bad row lands.
    const raw = probe(store);
    raw.exec('PRAGMA foreign_keys = OFF');
    raw
      .prepare(
        'INSERT INTO edges (from_id, to_id, kind, metadata, created_at)' +
          " VALUES (?, ?, 'references', NULL, ?)",
      )
      .run(a, ghost, new Date().toISOString());
    raw.close();
    const report = store.checkout();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'orphan_edges');
    assert.equal(report.findings[0]!.id, undefined);
    assert.match(report.findings[0]!.detail, new RegExp(ghost));
  } finally {
    cleanup();
  }
});

test('checkout: invalid_metadata_json is the place corrupted metadata speaks', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    // Reads collapse invalid JSON into null metadata — silently. The
    // verdict sees the difference: one finding, no echo.
    const raw = probe(store);
    raw.prepare('UPDATE memories SET metadata = ? WHERE id = ?').run('not json', a);
    raw.close();
    const report = store.checkout();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'invalid_metadata_json');
    assert.equal(report.findings[0]!.id, a);
  } finally {
    cleanup();
  }
});

test('checkout: status_without_bridge finds a hand-edited superseded status', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // CLI-verb supersedes always leave a bridge; a bare status flip has none.
    const raw = probe(store);
    raw.prepare("UPDATE memories SET status = 'superseded' WHERE id = ?").run(b);
    raw.close();
    let report = store.checkout();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'status_without_bridge');
    assert.equal(report.findings[0]!.id, b);

    // Undo the hand edit, then the positive control: a verb supersede is
    // bridged by construction — the status lands WITH the edge in one
    // transaction.
    const undo = probe(store);
    undo.prepare("UPDATE memories SET status = 'active' WHERE id = ?").run(b);
    undo.close();
    store.supersede(a, '# Memory alpha-prime\n\nBody rewritten.');
    report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    cleanup();
  }
});

test('checkout: hot_without_active finds the v6 invariant broken by hand SQL', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // The verbs cannot produce this: every status transition cools in the
    // same UPDATE. Hand SQL can.
    const raw = probe(store);
    raw.prepare("UPDATE memories SET status = 'deprecated' WHERE id = ?").run(a);
    raw.close();
    // Two findings, one defect: the invariant break AND the gate's own
    // debt — a was the register's only hot memory, so the hand-cool leaves
    // an unserved register too.
    let report = store.checkout();
    assert.deepEqual(report.findings.map((finding) => finding.check).sort(), [
      'hot_without_active',
      'no_hot',
    ]);
    const flagged = report.findings.find((finding) => finding.check === 'hot_without_active');
    assert.equal(flagged!.id, a);

    // Repair: SQL clears the flag; curation re-serves the register — green.
    const repair = probe(store);
    repair.prepare('UPDATE memories SET hot = 0 WHERE id = ?').run(a);
    repair.close();
    store.setHot(b, true);
    report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    cleanup();
  }
});

test('checkout: the transitions keep the invariant — cooled terminations stay silent', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    // a is the hot one: supersede transfers the flag to the head, keeping
    // hot-on-active at the transition.
    const head = store.supersede(a, '# Memory alpha-prime\n\nBody rewritten.');
    assert.equal(store.get(head)!.hot, true, 'supersede transferred the hot flag to the head');
    let report = store.checkout();
    assert.deepEqual(
      report.findings.filter((finding) => finding.check === 'hot_without_active'),
      [],
    );

    // And the termination cools — the flag never survives a status change.
    store.deprecate(head);
    report = store.checkout();
    assert.deepEqual(
      report.findings.filter((finding) => finding.check === 'hot_without_active'),
      [],
    );
    // b is now the only active and it is cold: the gate speaks instead.
    assert.ok(report.findings.some((finding) => finding.check === 'no_hot'));
  } finally {
    cleanup();
  }
});

test('checkout: fts_integrity finds drift and the SQL rebuild repairs it', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // A third memory keeps b linked, so the only defect below is the index:
    // hand-deleting a cascades its edges, but b still holds c -> b.
    const c = store.store('# Memory gamma\n\nBody gamma.\n\nKeywords: gamma.', {
      metadata: { kind: 'note' },
    });
    store.link(c, b, 'references');
    // The register keeps a curator while a dies — the ONLY defect below
    // is the index.
    store.setHot(c, true);
    // Corrupt like a hand edit: delete bypassing the FTS delete trigger,
    // leaving a ghost rowid in the index.
    const raw = probe(store);
    raw.exec('DROP TRIGGER memories_ad');
    raw.prepare('DELETE FROM memories WHERE id = ?').run(a);
    raw.close();

    let report = store.checkout();
    assert.equal(report.healthy, false);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'fts_integrity');
    assert.match(
      report.findings[0]!.hint,
      /INSERT INTO memories_fts\(memories_fts\) VALUES\('rebuild'\)/,
    );

    // The repair route (post-fix: outside the library, on a raw
    // connection) — one SQL line, then the verdict goes green.
    const repair = probe(store);
    repair.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
    repair.close();
    report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    cleanup();
  }
});

test(
  'checkout: file_permissions reports a loosened store below owner-only',
  { skip: process.platform === 'win32' },
  () => {
    const { store, cleanup } = tempStore();
    try {
      healthyPair(store);
      chmodSync(store.dbPath, 0o644);
      try {
        const report = store.checkout();
        const finding = report.findings.find((candidate) => candidate.check === 'file_permissions');
        assert.ok(finding, 'the loosened store is reported');
        assert.match(finding.hint, /chmod 600/);
      } finally {
        // restore before close so nothing else trips on the mode
        chmodSync(store.dbPath, 0o600);
      }
    } finally {
      cleanup();
    }
  },
);

test('checkout: no_hot — an active register with nothing curated is a debt', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    store.setHot(a, false);
    let report = store.checkout();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'no_hot');
    assert.equal(report.findings[0]!.id, undefined);
    assert.equal(report.summary.hot_memories, 0);

    // The payable path: curate — then green.
    store.setHot(a, true);
    report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.hot_memories, 1);
  } finally {
    cleanup();
  }
});

test('checkout: no_hot stays silent when there is nothing to serve', () => {
  const { store, cleanup } = tempStore();
  try {
    // A store of corpses only: actives 0, so nothing is owed to recover.
    const doomed = store.store('born to die', { metadata: { kind: 'note' } });
    store.deprecate(doomed);
    let report = store.checkout();
    assert.equal(report.healthy, true, 'only-corpses store: nothing to serve, no finding');
    assert.deepEqual(report.findings, []);

    // And a store that is entirely empty.
    const fresh = tempStore();
    try {
      report = fresh.store.checkout();
      assert.equal(report.healthy, true);
      assert.deepEqual(report.findings, []);
    } finally {
      fresh.cleanup();
    }
  } finally {
    cleanup();
  }
});

test('checkout: isolated_active — islands owe consolidation once others exist', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // Two unlinked actives: exactly one aggregated finding listing both.
    const c = store.store('# Memory gamma\n\nBody gamma.\n\nKeywords: gamma.', {
      metadata: { kind: 'note' },
    });
    store.setHot(b, false);
    store.setHot(c, true);
    let report = store.checkout();
    const islands = report.findings.filter((finding) => finding.check === 'isolated_active');
    assert.equal(islands.length, 1);
    assert.match(islands[0]!.detail, new RegExp(c));

    // The payable paths: link the island — then green.
    store.link(a, c, 'references');
    report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    cleanup();
  }
});

test('checkout: isolated_active stays silent for a one-memory store (an atom)', () => {
  const { store, cleanup } = tempStore();
  try {
    const single = store.store('# Alone\n\nNothing to relate to yet.', {
      metadata: { kind: 'note' },
    });
    store.setHot(single, true);
    const report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    cleanup();
  }
});

test('checkout: duplicate_titles groups identical active headings only', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // Positive: a third active with the exact same first-line heading as a.
    const c = store.store('# Memory alpha\n\nBody clone.\n\nKeywords: clone.', {
      metadata: { kind: 'note' },
    });
    store.link(b, c, 'references');
    store.setHot(c, true);
    let report = store.checkout();
    const duplicates = report.findings.filter((finding) => finding.check === 'duplicate_titles');
    assert.equal(duplicates.length, 1);
    assert.match(duplicates[0]!.detail, new RegExp(a));
    assert.match(duplicates[0]!.detail, new RegExp(c));

    // Negative control: a superseded predecessor sharing the title is
    // history, not a duplicate — supersede a with a distinct title and the
    // active-title clash disappears entirely.
    const successor = store.supersede(a, '# Memory alpha-prime\n\nBody rewritten.');
    store.link(successor, b, 'references');
    report = store.checkout();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.ok(successor);
  } finally {
    cleanup();
  }
});

test('checkout: heading-less actives never group as duplicates', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    const plainOne = store.store('Plain first line one.\n\nKeywords: d.', {
      metadata: { kind: 'note' },
    });
    const plainTwo = store.store('Plain first line two.\n\nKeywords: e.', {
      metadata: { kind: 'note' },
    });
    store.link(plainOne, plainTwo, 'references');
    const report = store.checkout();
    assert.equal(
      report.findings.filter((finding) => finding.check === 'duplicate_titles').length,
      0,
    );
    assert.ok(a && b);
  } finally {
    cleanup();
  }
});

test('checkout: all-or-nothing — pay every debt, then the light is green', () => {
  const { store, cleanup } = tempStore();
  try {
    // A messy session: memories stored, nothing linked, nothing curated,
    // the same title twice. The verdict names each debt — corruption first
    // by the ordered contract, then consolidation.
    const first = store.store('# The plan\n\nDo the thing.\n\nKeywords: plan.', {
      metadata: { kind: 'note' },
    });
    const second = store.store('# The plan\n\nDo it better.\n\nKeywords: plan.', {
      metadata: { kind: 'note' },
    });
    const report = store.checkout();
    assert.equal(report.healthy, false);
    const checks = report.findings.map((finding) => finding.check);
    assert.ok(checks.includes('no_hot'));
    assert.ok(checks.includes('isolated_active'));
    assert.ok(checks.includes('duplicate_titles'));

    // Pay: curate one memory, relate the pair, merge the duplicate titles.
    store.setHot(first, true);
    store.link(first, second, 'references');
    const fused = store.merge(
      [first, second],
      '# The plan, merged\n\nOne plan.\n\nKeywords: plan.',
      {
        summary: 'the one plan',
      },
    );
    store.setHot(fused, true);
    store.link(fused, second, 'references');
    const green = store.checkout();
    assert.equal(green.healthy, true);
    assert.deepEqual(green.findings, []);
  } finally {
    cleanup();
  }
});

test('checkout: runs read-only against a read-only open', () => {
  const { store, cleanup } = tempStore();
  try {
    healthyPair(store);
    const archive = Store.open({ dbPath: store.dbPath, readOnly: true });
    try {
      const report = archive.checkout();
      assert.equal(report.healthy, true);
      assert.deepEqual(report.findings, []);
      assert.equal(report.summary.checks, CHECKOUT_CHECK_COUNT);
    } finally {
      archive.close();
    }
  } finally {
    cleanup();
  }
});

test('checkout: the verdict is timeless — old debts still block', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // Backdate everything out of any session window, then cool the
    // curation: the verdict has no window — a register nobody curated owes
    // curation whenever it was born. One finding, the debt itself.
    store.setHot(a, false);
    store.setHot(b, false);
    const raw = probe(store);
    raw.prepare("UPDATE memories SET created_at = '2020-01-01T00:00:00.000Z'").run();
    raw.close();
    const report = store.checkout();
    const checks = report.findings.map((finding) => finding.check);
    assert.deepEqual(checks, ['no_hot']);
    assert.equal(report.healthy, false);
  } finally {
    cleanup();
  }
});
