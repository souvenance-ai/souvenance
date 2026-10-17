// Ghost probe: quantify FTS index ghosts (indexed docids absent from memories)
// and test whether plain READS (get -> access_count UPDATE -> trigger
// memories_au) grow them. Run on a COPY of a store to keep tiers pristine.
//
// Usage: node --experimental-strip-types .scratch/big-store/ghost-probe.mjs <storePath>

import { Store } from "../../src/db.ts";

const p = process.argv[2];
const s = Store.open({ dbPath: p });
// 'row' vocab counts TERMS (its rowid is sequential, not a docid) — that
// artefact made the first probe report 599 fake "ghosts". The honest probe
// is the 'instance' vocab: its rowid IS the FTS docid.
s.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.vocab USING fts5vocab('main','memories_fts','instance')");

const probe = () => ({
  indexed_docs: s.db.prepare("SELECT COUNT(DISTINCT rowid) AS n FROM temp.vocab").get().n,
  memories_rows: s.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n,
  ghosts: s.db.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT DISTINCT rowid AS d FROM temp.vocab) v WHERE v.d NOT IN (SELECT rowid FROM memories)",
  ).get().n,
  last_rowid: s.db.prepare("SELECT MAX(rowid) AS n FROM memories").get().n,
});

console.log("initial        ", JSON.stringify(probe()));

const someId = s.db.prepare("SELECT id FROM memories WHERE status='active' ORDER BY created_at DESC LIMIT 1").get().id;
s.get(someId);
console.log("after 1 get    ", JSON.stringify(probe()));

s.get(someId);
console.log("after 2 gets   ", JSON.stringify(probe()));

const q = s.search("supersede", { limit: 5 });
console.log(`after 1 search (top${q.length})`, JSON.stringify(probe()));

// does an explicit content-preserving re-store via the library heal it?
// (re-inserting the same rowid is impossible via the API; test stays read-only)
console.log("same id re-get x3");
s.get(someId); s.get(someId); s.get(someId);
console.log("after 3 more   ", JSON.stringify(probe()));
s.close();
