import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'vitest';
import { DOCTOR_CHECK_COUNT, Store } from './store.ts';

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-doctor-test-'));
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
 * The healthy baseline: two linked living memories, one of them hot. The
 * doctor reports zero findings on it. Every defect test starts here and
 * applies exactly one defect — so the expected findings array is the
 * check's full contract, not just its presence. Curation is irrelevant to
 * the audit (no_hot is the checkout's gate); the fixture keeps one hot
 * memory because hot is a status now (#38) — a state the audit never
 * judges. The retired hot_without_active check has no negative control to
 * keep: hot-on-a-terminal is unrepresentable in one column.
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

test('doctor: a healthy pair has zero findings and a coherent summary', () => {
  const { store, cleanup } = tempStore();
  try {
    healthyPair(store);
    const report = store.doctor();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.checks, DOCTOR_CHECK_COUNT);
    assert.equal(report.summary.issues, 0);
    assert.equal(report.summary.memories, 2);
    assert.equal(report.summary.edges, 1);
    assert.deepEqual(report.summary.edges_by_kind, { references: 1 });
  } finally {
    cleanup();
  }
});

test('doctor: an empty fresh store is healthy', () => {
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

test('doctor: orphan_edges finds an edge row with a missing endpoint', () => {
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
    const report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'orphan_edges');
    assert.equal(report.findings[0]!.id, undefined);
    assert.match(report.findings[0]!.detail, new RegExp(ghost));
  } finally {
    cleanup();
  }
});

test('doctor: invalid_metadata_json is the place corrupted metadata speaks', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    // Reads collapse invalid JSON into null metadata — silently. The
    // audit sees the difference: one finding, no echo.
    const raw = probe(store);
    raw.prepare('UPDATE memories SET metadata = ? WHERE id = ?').run('not json', a);
    raw.close();
    const report = store.doctor();
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'invalid_metadata_json');
    assert.equal(report.findings[0]!.id, a);
  } finally {
    cleanup();
  }
});

test('doctor: status_without_bridge finds a hand-edited superseded status', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // Verb supersedes always leave a bridge; a bare status flip has none.
    const raw = probe(store);
    raw.prepare("UPDATE memories SET status = 'superseded' WHERE id = ?").run(b);
    raw.close();
    let report = store.doctor();
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
    report = store.doctor();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    cleanup();
  }
});

test('doctor: the transitions keep the state machine coherent — terminations stay silent', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a } = healthyPair(store);
    // a is the hot one: supersede transfers the status to the head, keeping
    // the curation among the living at the transition.
    const head = store.supersede(a, '# Memory alpha-prime\n\nBody rewritten.');
    assert.equal(
      store.get(head)!.status,
      'hot',
      'supersede transferred the hot status to the head',
    );
    let report = store.doctor();
    assert.equal(report.healthy, true);

    // And the termination cools for free — the status just moves; there is
    // no parallel mark to clear and no contradiction left to catch.
    store.deprecate(head);
    report = store.doctor();
    assert.equal(report.healthy, true, 'the audit is blind to curation — no_hot is the gate');
  } finally {
    cleanup();
  }
});

test('doctor: fts_integrity finds drift and the SQL rebuild repairs it', () => {
  const { store, cleanup } = tempStore();
  try {
    const { a, b } = healthyPair(store);
    // A third memory keeps b linked, so the only defect below is the index:
    // hand-deleting a cascades its edges, but b still holds c -> b.
    const c = store.store('# Memory gamma\n\nBody gamma.\n\nKeywords: gamma.', {
      kind: 'note',
    });
    store.link(c, b, 'references');
    // Corrupt like a hand edit: delete bypassing the FTS delete trigger,
    // leaving a ghost rowid in the index.
    const raw = probe(store);
    raw.exec('DROP TRIGGER memories_ad');
    raw.prepare('DELETE FROM memories WHERE id = ?').run(a);
    raw.close();

    let report = store.doctor();
    assert.equal(report.healthy, false);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.check, 'fts_integrity');
    assert.match(
      report.findings[0]!.hint,
      /INSERT INTO memories_fts\(memories_fts\) VALUES\('rebuild'\)/,
    );

    // The repair route (outside the library, on a raw connection) — one
    // SQL line, then the verdict goes green.
    const repair = probe(store);
    repair.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
    repair.close();
    report = store.doctor();
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
  } finally {
    cleanup();
  }
});

test(
  'doctor: file_permissions reports a loosened store below owner-only',
  { skip: process.platform === 'win32' },
  () => {
    const { store, cleanup } = tempStore();
    try {
      healthyPair(store);
      chmodSync(store.dbPath, 0o644);
      try {
        const report = store.doctor();
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
