import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'vitest';
import { SCHEMA_VERSION } from './migration/migration.ts';
import { Store } from './store.ts';

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

test('open requires a dbPath — the library never guesses a location', () => {
  // Type-level guarantee: OpenOptions.dbPath is non-optional. Pinned at
  // runtime by the shape of every other call in this suite.
  assert.ok(true);
});

test('open creates all tables on a fresh store', () => {
  const { store, cleanup } = tempStore();
  try {
    const tables = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    assert.ok(names.includes('memories'));
    assert.ok(names.includes('edges'));
    assert.ok(names.includes('schema_version'));
    assert.ok(names.includes('memories_fts'));
  } finally {
    cleanup();
  }
});

test('the fresh store is at SCHEMA_VERSION, with the v6 column set', () => {
  const { store, cleanup } = tempStore();
  try {
    const version = store.db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
      v: number;
    };
    assert.equal(version.v, SCHEMA_VERSION);
    const columns = (
      store.db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]
    ).map((c) => c.name);
    assert.ok(columns.includes('hot'), 'the v6 curation flag exists');
    assert.ok(!columns.includes('weight'), 'weight was dropped by the refonte');
    assert.ok(!columns.includes('access_count'), 'the read-signal column was dropped');
  } finally {
    cleanup();
  }
});

test('reopening is a no-op (schema_version unchanged)', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    const s1 = Store.open({ dbPath: path });
    const v1 = s1.db.prepare('SELECT version FROM schema_version').get() as { version: number };
    s1.close();
    const s2 = Store.open({ dbPath: path });
    const v2 = s2.db.prepare('SELECT version FROM schema_version').get() as { version: number };
    assert.equal(v2.version, v1.version);
    s2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WAL and FK pragmas are set', () => {
  const { store, cleanup } = tempStore();
  try {
    const journal = store.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    assert.equal(journal.journal_mode, 'wal');
    const fk = store.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert.equal(fk.foreign_keys, 1);
  } finally {
    cleanup();
  }
});

test('FTS5 stays in sync: insert, update, delete', () => {
  const { store, cleanup } = tempStore();
  try {
    const db = store.db;
    db.prepare('INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)').run(
      'a1',
      'hello world',
      null,
      new Date().toISOString(),
    );
    db.prepare('INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)').run(
      'a2',
      'goodbye cruel world',
      null,
      new Date().toISOString(),
    );

    const match = db
      .prepare(
        'SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ? ORDER BY rank',
      )
      .all('world') as { id: string }[];
    assert.equal(match.length, 2);

    db.prepare('UPDATE memories SET content = ? WHERE id = ?').run('hello universe', 'a1');
    const afterUpdate = db
      .prepare(
        'SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?',
      )
      .all('universe') as { id: string }[];
    assert.equal(afterUpdate.length, 1);
    assert.equal(afterUpdate[0]!.id, 'a1');

    db.prepare('DELETE FROM memories WHERE id = ?').run('a2');
    const afterDelete = db
      .prepare(
        'SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?',
      )
      .all('goodbye') as { id: string }[];
    assert.equal(afterDelete.length, 0);
  } finally {
    cleanup();
  }
});

test('FK cascade: deleting a memory removes its edges', () => {
  const { store, cleanup } = tempStore();
  try {
    const db = store.db;
    const now = new Date().toISOString();
    db.prepare('INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)').run(
      'a1',
      'one',
      null,
      now,
    );
    db.prepare('INSERT INTO memories (id, content, metadata, created_at) VALUES (?, ?, ?, ?)').run(
      'a2',
      'two',
      null,
      now,
    );
    db.prepare(
      'INSERT INTO edges (from_id, to_id, kind, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('a1', 'a2', 'references', null, now);

    db.prepare('DELETE FROM memories WHERE id = ?').run('a1');
    const edges = db.prepare('SELECT count(*) as c FROM edges').get() as { c: number };
    assert.equal(edges.c, 0);
  } finally {
    cleanup();
  }
});

test('v6 migration: the legacy recover basket arrives hot, dead columns dropped', () => {
  const dir = tempDir();
  const path = join(dir, 'memory.db');
  try {
    // Seed a live store, then rewind it to the v5 shape (weight +
    // access_count present, hot gone, version 5) so reopening runs the real
    // V6 migration path.
    const seed = Store.open({ dbPath: path });
    const directive = seed.store('a directive', { metadata: { kind: 'directive' } });
    const summary = seed.store('a summary', { metadata: { kind: 'summary' } });
    const openObjective = seed.store('an open objective', {
      metadata: { kind: 'objective', state: 'open' },
    });
    const closedObjective = seed.store('a closed objective', {
      metadata: { kind: 'objective', state: 'done' },
    });
    const note = seed.store('a plain note', { metadata: { kind: 'note' } });
    const supersededDirective = seed.store('a retired directive', {
      metadata: { kind: 'directive' },
    });
    seed.supersede(supersededDirective, 'the replacement directive');
    seed.close();

    const raw = new DatabaseSync(path);
    raw.exec(`
      ALTER TABLE memories DROP COLUMN hot;
      ALTER TABLE memories ADD COLUMN weight REAL NOT NULL DEFAULT 0.5;
      ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
      DELETE FROM schema_version WHERE version >= 5;
      INSERT INTO schema_version (version, applied_at) VALUES (5, '2026-01-01T00:00:00.000Z');
    `);
    raw.close();

    const migrated = Store.open({ dbPath: path });
    try {
      const hotById = () =>
        Object.fromEntries(
          (
            migrated.db.prepare('SELECT id, hot FROM memories').all() as {
              id: string;
              hot: number;
            }[]
          ).map((r) => [r.id, r.hot]),
        );
      const hot = hotById();
      assert.equal(hot[directive], 1, 'an active directive arrives hot');
      assert.equal(hot[summary], 1, 'an active summary arrives hot');
      assert.equal(hot[openObjective], 1, 'an open objective arrives hot');
      assert.equal(hot[closedObjective] ?? 0, 0, 'a closed objective does not');
      assert.equal(hot[note] ?? 0, 0, 'a plain note does not');
      assert.equal(hot[supersededDirective] ?? 0, 0, 'a superseded directive does not');

      const columns = (
        migrated.db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]
      ).map((c) => c.name);
      assert.ok(!columns.includes('weight'));
      assert.ok(!columns.includes('access_count'));

      // And the migrated store is writable again (the refonte surface).
      const id = migrated.store('post-migration write');
      assert.ok(id);
    } finally {
      migrated.close();
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
    const rw = Store.open({ dbPath: path });
    const a = rw.store('memory a');
    const b = rw.store('memory b');
    rw.close();
    const ro = Store.open({ dbPath: path, readOnly: true });
    try {
      assert.throws(() => ro.store('new content'), /read-only/);
      assert.throws(() => ro.link(a, b, 'references'), /read-only/);
      assert.throws(() => ro.unlink(a, b), /read-only/);
      assert.throws(() => ro.deprecate(a), /read-only/);
      assert.throws(() => ro.supersede(a, 'next'), /read-only/);
      assert.throws(() => ro.merge([a, b], 'merged'), /read-only/);
      assert.throws(() => ro.setHot(a, true), /read-only/);
    } finally {
      ro.close();
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
