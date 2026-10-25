import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
 * exactly one debt — so the expected findings array is the gate's full
 * contract, not just its presence. The kind column is fixture flavour:
 * no check reads it — the gate is kind-free (#31).
 */
function healthyPair(store: Store): { a: string; b: string } {
  const a = store.store('# Memory alpha\n\nBody alpha.\n\nKeywords: alpha, test.', {
    kind: 'note',
  });
  const b = store.store('# Memory beta\n\nBody beta.\n\nKeywords: beta, test.', {
    kind: 'note',
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
    // A store of corpses only: actives 0, so nothing is owed to checkin.
    const doomed = store.store('born to die', { kind: 'note' });
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
      kind: 'note',
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
      kind: 'note',
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
      kind: 'note',
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
      kind: 'note',
    });
    const plainTwo = store.store('Plain first line two.\n\nKeywords: e.', {
      kind: 'note',
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

test('checkout: all-or-nothing — pay every consolidation debt, then the light is green', () => {
  const { store, cleanup } = tempStore();
  try {
    // A messy session: memories stored, nothing linked, nothing curated,
    // the same title twice. The verdict names each consolidation debt —
    // and the all-or-nothing contract blocks on any of them.
    const first = store.store('# The plan\n\nDo the thing.\n\nKeywords: plan.', {
      kind: 'note',
    });
    const second = store.store('# The plan\n\nDo it better.\n\nKeywords: plan.', {
      kind: 'note',
    });
    const report = store.checkout();
    assert.equal(report.healthy, false);
    assert.deepEqual(
      report.findings.map((finding) => finding.check),
      ['no_hot', 'isolated_active', 'duplicate_titles'],
    );

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

test('checkout: corruption is doctor\u2019s business — a hand-corrupted store stays green', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    // Inject one orphan edge by hand (a second raw connection, FK off).
    const ghost = '00000000-0000-4000-8000-000000000002';
    const raw = probe(store);
    raw.exec('PRAGMA foreign_keys = OFF');
    raw
      .prepare(
        'INSERT INTO edges (from_id, to_id, kind, metadata, created_at)' +
          " VALUES (?, ?, 'references', NULL, ?)",
      )
      .run(a, ghost, new Date().toISOString());
    raw.close();

    // The independence contract: the gate is blind to corruption — its
    // green light stays reachable (a corruption finding would be a debt no
    // verb can pay, and the ritual would never close). The doctor sees it.
    const gate = store.checkout();
    assert.equal(gate.healthy, true, 'the gate reports only verb-payable debts');
    assert.deepEqual(gate.findings, []);
    const audit = store.doctor();
    assert.equal(audit.findings.length, 1);
    assert.equal(audit.findings[0]!.check, 'orphan_edges');
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
    assert.deepEqual(
      report.findings.map((finding) => finding.check),
      ['no_hot'],
    );
    assert.equal(report.healthy, false);
  } finally {
    cleanup();
  }
});
