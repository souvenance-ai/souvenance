import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expectTypeOf, test } from 'vitest';
import { SCHEMA_VERSION } from './migration/migration.ts';
import { type OpenOptions, Store } from './store.ts';

function tempStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-test-'));
  const store = Store.open({ dbPath: join(dir, 'memory.db') });
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-open-'));
}

/**
 * A raw probe on a store file — the schema-inspection vantage. The store's
 * own connection is `#db`-private (no in-process raw access), and the
 * facts these probes read (tables, schema rows, the WAL journal mode) are
 * file state any second connection sees — the hand-SQL scenario the store
 * must survive.
 */
function probe(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

test('open requires a dbPath — the library never guesses a location', () => {
  // Compile-time pin: OpenOptions.dbPath is REQUIRED. If someone relaxes
  // the interface, OpenOptions stops extending { dbPath: string } and the
  // typecheck fails here.
  expectTypeOf<OpenOptions>().toExtend<{ dbPath: string }>();
});

test('open creates all tables on a fresh store', () => {
  const { store, cleanup } = tempStore();
  try {
    const db = probe(store.dbPath);
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((table) => table.name);
      assert.ok(names.includes('memories'));
      assert.ok(names.includes('edges'));
      assert.ok(names.includes('schema_version'));
      assert.ok(names.includes('memories_fts'));
    } finally {
      db.close();
    }
  } finally {
    cleanup();
  }
});

test('the fresh store is at SCHEMA_VERSION, with the v6 column set', () => {
  const { store, cleanup } = tempStore();
  try {
    const db = probe(store.dbPath);
    try {
      const version = db
        .prepare('SELECT MAX(version) AS max_version FROM schema_version')
        .get() as {
        max_version: number;
      };
      assert.equal(version.max_version, SCHEMA_VERSION);
      const columns = (db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]).map(
        (column) => column.name,
      );
      assert.ok(columns.includes('hot'), 'the v6 curation flag exists');
      assert.ok(columns.includes('summary'), 'the v6 authored condensation exists');
      assert.ok(columns.includes('kind'), 'the v6 classification column exists (#31)');
      assert.ok(!columns.includes('weight'), 'weight was dropped by the refonte');
      assert.ok(!columns.includes('access_count'), 'the read-signal column was dropped');
    } finally {
      db.close();
    }
  } finally {
    cleanup();
  }
});

test('reopening is a no-op (schema_version unchanged)', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    const first = Store.open({ dbPath: path });
    first.close();
    let firstVersion: number;
    {
      const db = probe(path);
      try {
        firstVersion = (
          db.prepare('SELECT version FROM schema_version').get() as {
            version: number;
          }
        ).version;
      } finally {
        db.close();
      }
    }
    const second = Store.open({ dbPath: path });
    second.close();
    let secondVersion: number;
    {
      const db = probe(path);
      try {
        secondVersion = (
          db.prepare('SELECT version FROM schema_version').get() as {
            version: number;
          }
        ).version;
      } finally {
        db.close();
      }
    }
    assert.equal(secondVersion, firstVersion);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the store file speaks WAL — a second connection sees the journal mode', () => {
  const { store, cleanup } = tempStore();
  try {
    const db = probe(store.dbPath);
    try {
      // journal_mode is a FILE property once WAL: any connection reads it.
      const journal = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      assert.equal(journal.journal_mode, 'wal');
    } finally {
      db.close();
    }
    // The foreign_keys pragma is per-connection, invisible from outside:
    // its last wall is not a pinned pragma but the checkout's
    // orphan_edges finding — a dropped enforcement line lands as drift
    // the verdict reports.
  } finally {
    cleanup();
  }
});

test('FTS5 stays in sync: insert, update, delete', () => {
  const { store, cleanup } = tempStore();
  try {
    // The triggers are schema-level: ANY writer on the file — here a raw
    // second connection, the hand-SQL vantage — stays indexed.
    const raw = probe(store.dbPath);
    try {
      raw
        .prepare(
          'INSERT INTO memories (id, content, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('a1', 'hello world', 'note', null, new Date().toISOString());
      raw
        .prepare(
          'INSERT INTO memories (id, content, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('a2', 'goodbye cruel world', 'note', null, new Date().toISOString());

      const match = raw
        .prepare(
          'SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ? ORDER BY rank',
        )
        .all('world') as { id: string }[];
      assert.equal(match.length, 2);

      raw.prepare('UPDATE memories SET content = ? WHERE id = ?').run('hello universe', 'a1');
      const afterUpdate = raw
        .prepare(
          'SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?',
        )
        .all('universe') as { id: string }[];
      assert.equal(afterUpdate.length, 1);
      assert.equal(afterUpdate[0]!.id, 'a1');

      raw.prepare('DELETE FROM memories WHERE id = ?').run('a2');
      const afterDelete = raw
        .prepare(
          'SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?',
        )
        .all('goodbye') as { id: string }[];
      assert.equal(afterDelete.length, 0);
    } finally {
      raw.close();
    }
  } finally {
    cleanup();
  }
});

test('FK cascade: deleting a memory removes its edges', () => {
  const { store, cleanup } = tempStore();
  try {
    const raw = probe(store.dbPath);
    try {
      const now = new Date().toISOString();
      raw
        .prepare(
          'INSERT INTO memories (id, content, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('a1', 'one', 'note', null, now);
      raw
        .prepare(
          'INSERT INTO memories (id, content, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('a2', 'two', 'note', null, now);
      raw
        .prepare(
          'INSERT INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('a1', 'a2', 'references', null, now);

      raw.prepare('DELETE FROM memories WHERE id = ?').run('a1');
      const edges = raw.prepare('SELECT count(*) as c FROM edges').get() as { c: number };
      assert.equal(edges.c, 0);
    } finally {
      raw.close();
    }
  } finally {
    cleanup();
  }
});

test('v6 migration: the legacy recover basket arrives hot, kind becomes a column, dead columns dropped', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    // Seed a live store, then rewind it to the v5 shape (weight +
    // access_count present, hot/summary/kind gone, the kind back inside
    // metadata, version 5) so reopening runs the real V6 migration path.
    const seed = Store.open({ dbPath: path });
    const directive = seed.store('a directive', { kind: 'directive' });
    const summary = seed.store('a summary', { kind: 'summary' });
    const openObjective = seed.store('an open objective', {
      kind: 'objective',
      metadata: { state: 'open' },
    });
    const closedObjective = seed.store('a closed objective', {
      kind: 'objective',
      metadata: { state: 'done' },
    });
    const note = seed.store('a plain note', { kind: 'note' });
    const supersededDirective = seed.store('a retired directive', { kind: 'directive' });
    const replacement = seed.supersede(supersededDirective, 'the replacement directive');
    seed.close();

    const raw = new DatabaseSync(path);
    raw.exec(`
        UPDATE memories SET metadata = json_set(COALESCE(metadata, '{}'), '$.kind', kind);
        ALTER TABLE memories DROP COLUMN kind;
        ALTER TABLE memories DROP COLUMN hot;
        ALTER TABLE memories DROP COLUMN summary;
        ALTER TABLE memories ADD COLUMN weight REAL NOT NULL DEFAULT 0.5;
        ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
        DELETE FROM schema_version WHERE version >= 5;
        INSERT INTO schema_version (version, applied_at) VALUES (5, '2026-01-01T00:00:00.000Z');
      `);
    raw.close();

    const migrated = Store.open({ dbPath: path });
    try {
      // And the migrated store is writable again (the refonte surface).
      const id = migrated.store('post-migration write', { kind: 'note' });
      assert.ok(id);
    } finally {
      migrated.close();
    }

    // The migration's effect is file state — a raw connection reads it.
    const db = probe(path);
    try {
      const rows = db.prepare('SELECT id, hot, kind, metadata FROM memories').all() as {
        id: string;
        hot: number;
        kind: string;
        metadata: string | null;
      }[];
      const hot = Object.fromEntries(rows.map((row) => [row.id, row.hot]));
      const kindOf = Object.fromEntries(rows.map((row) => [row.id, row.kind]));
      const metadataOf = Object.fromEntries(
        rows.map((row) => [row.id, JSON.parse(row.metadata ?? 'null') as unknown]),
      );

      // The backfill: kind is a column, sourced from the metadata tag.
      assert.equal(kindOf[directive], 'directive');
      assert.equal(kindOf[summary], 'summary');
      assert.equal(kindOf[openObjective], 'objective');
      assert.equal(kindOf[closedObjective], 'objective');
      assert.equal(kindOf[note], 'note');
      assert.equal(kindOf[supersededDirective], 'directive');
      assert.equal(kindOf[replacement], 'directive', 'the head inherited the source kind');

      // The strip: metadata.kind is gone from every row — one source of
      // truth from v6 on (no divergence invariant, no doctor check).
      assert.deepEqual(metadataOf[openObjective], { state: 'open' }, 'kind stripped, state kept');
      assert.deepEqual(metadataOf[closedObjective], { state: 'done' });
      assert.equal('kind' in (metadataOf[note] as object), false);

      // The legacy recover basket arrives hot (read BEFORE the strip).
      assert.equal(hot[directive], 1, 'an active directive arrives hot');
      assert.equal(hot[summary], 1, 'an active summary arrives hot');
      assert.equal(hot[openObjective], 1, 'an open objective arrives hot');
      assert.equal(hot[closedObjective] ?? 0, 0, 'a closed objective does not');
      assert.equal(hot[note] ?? 0, 0, 'a plain note does not');
      assert.equal(hot[supersededDirective] ?? 0, 0, 'a superseded directive does not');

      const columns = (db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]).map(
        (column) => column.name,
      );
      assert.ok(columns.includes('kind'));
      assert.ok(!columns.includes('weight'));
      assert.ok(!columns.includes('access_count'));
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('v6 migration: a row without a metadata kind arrives unclassified', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    const seed = Store.open({ dbPath: path });
    const note = seed.store('a plain note', { kind: 'note' });
    seed.close();

    const raw = new DatabaseSync(path);
    raw.exec(`
      UPDATE memories SET metadata = json_set(COALESCE(metadata, '{}'), '$.kind', kind);
      ALTER TABLE memories DROP COLUMN kind;
      ALTER TABLE memories DROP COLUMN hot;
      ALTER TABLE memories DROP COLUMN summary;
      ALTER TABLE memories ADD COLUMN weight REAL NOT NULL DEFAULT 0.5;
      ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
      DELETE FROM schema_version WHERE version >= 5;
      INSERT INTO schema_version (version, applied_at) VALUES (5, '2026-01-01T00:00:00.000Z');
    `);
    // The genuine v5 shape of an untagged row: no kind anywhere. The
    // backfill marks the debt; reclassifying it is a supersede (the
    // `summary = null` precedent).
    raw
      .prepare("UPDATE memories SET metadata = json_remove(metadata, '$.kind') WHERE id = ?")
      .run(note);
    raw.close();

    const migrated = Store.open({ dbPath: path });
    try {
      const memory = migrated.get(note)!;
      assert.equal(memory.kind, 'unclassified', 'the untagged row arrives marked');
      // The rewind's COALESCE round-trip (kind → metadata) leaves an empty
      // object behind once the strip removes the key — {} , not null.
      assert.deepEqual(memory.metadata, {});
      const stats = migrated.stats();
      assert.deepEqual(stats.memories_by_kind, { unclassified: 1 });
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('v6 migration: hand-corrupted metadata refuses the migration — refuse, don\u2019t hide', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    const seed = Store.open({ dbPath: path });
    seed.store('a plain note', { kind: 'note' });
    seed.close();

    const raw = new DatabaseSync(path);
    raw.exec(`
      UPDATE memories SET metadata = json_set(COALESCE(metadata, '{}'), '$.kind', kind);
      ALTER TABLE memories DROP COLUMN kind;
      ALTER TABLE memories DROP COLUMN hot;
      ALTER TABLE memories DROP COLUMN summary;
      ALTER TABLE memories ADD COLUMN weight REAL NOT NULL DEFAULT 0.5;
      ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
      DELETE FROM schema_version WHERE version >= 5;
      INSERT INTO schema_version (version, applied_at) VALUES (5, '2026-01-01T00:00:00.000Z');
    `);
    raw.prepare('UPDATE memories SET metadata = ?').run('{not json');
    raw.close();

    // The backfill and the strip read metadata through the json functions,
    // so the corrupted row fails the migration: the store's truth is never
    // silently rewritten past corruption (dev ruling, 2026-10-25). The
    // ROLLBACK leaves the store at v5 — the operator repairs via SQL or
    // restores a backup, the doctor's vocabulary stays intact.
    assert.throws(() => Store.open({ dbPath: path }), /malformed JSON/);
    const after = probe(path);
    try {
      const version = (
        after.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }
      ).v;
      assert.equal(version, 5, 'the failed migration rolled back');
    } finally {
      after.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read-only open refuses a missing file and creates nothing', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    assert.throws(() => Store.open({ dbPath: path, readOnly: true }), /no store at/);
    assert.equal(existsSync(path), false, 'the store file must not be created');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read-only open does not create the parent directory', () => {
  const dir = tempDir();
  const path = join(dir, 'sub', 'memory.db');
  try {
    assert.throws(() => Store.open({ dbPath: path, readOnly: true }), /no store at/);
    assert.equal(existsSync(join(dir, 'sub')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read-only open refuses an older-schema store', () => {
  const { store, cleanup } = tempStore();
  const path = store.dbPath;
  try {
    const raw = new DatabaseSync(path);
    // schema_version holds one row per applied migration; a v5 store keeps rows 1..5.
    raw.prepare('DELETE FROM schema_version WHERE version > 5').run();
    raw.close();
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /schema version 5 .*open it read-write once to migrate/,
    );
  } finally {
    cleanup();
  }
});

test('read-only open refuses a pre-versioning store', () => {
  const dir = tempDir();
  const path = join(dir, 'legacy.db');
  try {
    const raw = new DatabaseSync(path);
    raw.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL)');
    raw.close();
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /open it read-write once to migrate/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read-only open refuses an empty (zero-page) file', () => {
  const dir = tempDir();
  const path = join(dir, 'empty.db');
  try {
    writeFileSync(path, '');
    assert.throws(
      () => Store.open({ dbPath: path, readOnly: true }),
      /open it read-write once to migrate/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every write verb refuses on a read-only store', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    const readWrite = Store.open({ dbPath: path });
    const a = readWrite.store('memory a', { kind: 'note' });
    const b = readWrite.store('memory b', { kind: 'note' });
    readWrite.close();
    const readOnlyStore = Store.open({ dbPath: path, readOnly: true });
    try {
      assert.throws(() => readOnlyStore.store('new content', { kind: 'note' }), /read-only/);
      assert.throws(() => readOnlyStore.link(a, b, 'references'), /read-only/);
      assert.throws(() => readOnlyStore.unlink(a, b), /read-only/);
      assert.throws(() => readOnlyStore.deprecate(a), /read-only/);
      assert.throws(() => readOnlyStore.supersede(a, 'next'), /read-only/);
      assert.throws(() => readOnlyStore.merge([a, b], 'merged'), /read-only/);
      assert.throws(() => readOnlyStore.setHot(a, true), /read-only/);
    } finally {
      readOnlyStore.close();
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
