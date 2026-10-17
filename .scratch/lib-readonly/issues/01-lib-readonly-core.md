# 01 — lib readonly core: Store.open({readOnly:true}), guard, read-signal skip

Status: resolved

## Body

`src/db.ts` + `src/migrations.ts`:

1. `OpenOptions.readOnly?: boolean`.
2. `Store.open` ro path: resolve path → `existsSync` check (clean error, no
   mkdir, nothing created) → `new DatabaseSync(dbPath, { readOnly: true })` →
   `busy_timeout` + `foreign_keys` pragmas only → version check
   (`schemaVersion(db)`, new pure-read helper in migrations.ts) → refuse if
   `< SCHEMA_VERSION` → return Store with the readonly flag.
3. `schemaVersion(db)` in migrations.ts: pure read, no table creation;
   returns 0 when the table is absent (pre-versioning store).
4. `assertWritable()` — throws `store is read-only (opened with readOnly:
   true); writes are refused` — called at entry of store, supersede, merge,
   update, delete, deprecate, link, and `doctor({fix:true})`.
5. Read-signal: search/get skip the access_count bump when readonly.

Tests in `src/db.readonly.test.ts`:

- ro open on missing file → error, no file/dir created.
- ro open on existing store → get/list/search/relations/tags/stats/doctor()
  all work; every write verb throws the readonly error; doctor({fix:true})
  throws.
- read-signal: search/get on a ro store leave access_count unchanged
  (stats().total_accesses stable); the same reads on a rw store DO bump.
- old-schema store (version rolled back via raw DatabaseSync) → ro open
  refuses with the migrate hint; pre-versioning store (raw db without
  schema_version) → refuses; empty file (version 0) → refuses.

## Answer

Shipped in `src/db.ts` + `src/migrations.ts`:

- `OpenOptions.readOnly?: boolean`; ro path in `Store.open`: `existsSync`
  refusal (`no store at <path>`, no mkdir, nothing created),
  `new DatabaseSync(dbPath, { readOnly: true })`, `busy_timeout` +
  `foreign_keys` pragmas only (journal_mode skipped), version check →
  refuse below `SCHEMA_VERSION` with the migrate hint.
- `schemaVersion(db)` in migrations.ts: the pure read `ensureVersionTable`
  could not be (it CREATEs the table); returns 0 for pre-versioning stores
  and unreadable ones — refuse-don't-hide.
- `assertWritable()` at entry of store, supersede, merge, update, delete,
  deprecate, link, and `doctor({fix:true})`; message `store is read-only
  (opened with readOnly: true); writes are refused`.
- Read-signal skipped in search/get when readonly.

`src/db.readonly.test.ts`: 9/9 — missing file (+ no parent dir created),
every read verb works, all 7 write verbs + doctor fix refuse, read-signal
skipped on ro / still bumping on rw, old-schema + pre-versioning + empty
file refusals. Note confirmed: the doctor's checkFts (VACUUM INTO) runs
fine on a readonly connection — GET /doctor stays intact on ro mounts.
