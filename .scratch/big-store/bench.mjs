// Big-store bench: measures get/search/list/relations/stats latency plus
// warm insert throughput and an FTS drift probe (fts5vocab) against a
// synthetic store produced by generate.mjs.
//
// Identity metric: for ritual-style queries, does the TOP-1 result still
// belong to the cloned identity set ("# Directive" / "# Summary" content
// prefix) when 5k adversarial notes share the same vocabulary?
//
// Usage: node --experimental-strip-types .scratch/big-store/bench.mjs <storePath>

import { Store } from "../../src/db.ts";
import { performance } from "node:perf_hooks";

const path = process.argv[2];
const s = Store.open({ dbPath: path });

function pct(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return +(a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? NaN).toFixed(3);
}
function now() { return performance.now(); }

// ---- get ---------------------------------------------------------------------
const ids = s.db.prepare("SELECT id FROM memories WHERE status='active' ORDER BY random() LIMIT 300").all().map((r) => r.id);
const getTimes = [];
for (const id of ids) {
  const t = now(); s.get(id); getTimes.push(now() - t);
}

// ---- search: identity ranking under adversarial flood -------------------------
const IDENTITY_QUERIES = [
  "recovery protocol directives",
  "session lifecycle clear relaunch",
  "memorization policy decision time",
  "identity agent memory persona",
  "weight importance scale",
];
const searchTimes = [];
let identityTop1 = 0;
let identityTop3 = 0;
let searches = 0;
for (const q of IDENTITY_QUERIES) {
  for (let i = 0; i < 12; i++) {
    const t = now();
    const res = s.search(q, { limit: 5 });
    searchTimes.push(now() - t);
    searches++;
    if (res[0] && /^(# Directive|# Summary)/.test(res[0].content)) identityTop1++;
    if (res.slice(0, 3).some((r) => /^(# Directive|# Summary)/.test(r.content))) identityTop3++;
  }
}

// single-word adversarial (highest match count)
const advTimes = [];
for (let i = 0; i < 30; i++) { const t = now(); s.search("supersede", { limit: 10 }); advTimes.push(now() - t); }

// ---- list with metadata filter (JSON1 scan) ------------------------------------
const listTimes = [];
for (let i = 0; i < 30; i++) {
  const t = now(); s.list({ where: "metadata->>'$.kind' = 'note'", limit: 20 }); listTimes.push(now() - t);
}

// ---- relations with resolve (walk supersedes chains) ---------------------------
const chainRows = s.db.prepare("SELECT from_id FROM edges WHERE kind='supersedes' ORDER BY random() LIMIT 10").all();
const relTimes = [];
for (const r of chainRows) {
  const t = now(); s.relations(r.from_id, { direction: "both", resolve: true }); relTimes.push(now() - t);
}

// ---- stats / tags (full scans) -------------------------------------------------
const statsTimes = [];
for (let i = 0; i < 10; i++) { const t = now(); s.stats(); statsTimes.push(now() - t); }
const tagsTimes = [];
for (let i = 0; i < 5; i++) { const t = now(); s.tags(); tagsTimes.push(now() - t); }

// ---- warm insert throughput ----------------------------------------------------
const t0 = now();
for (let i = 0; i < 200; i++) {
  s.store(`# Note: bench insert ${i}\n\nWarm write throughput probe sharing identity tokens: research recovery protocol directives. Keywords: supersede, store, weight, search keywords.`, { metadata: { kind: "note" }, weight: 0.4 });
}
const insertPer100 = now() - t0;

// ---- store size BEFORE warm inserts ---------------------------------------------
const active = s.db.prepare("SELECT COUNT(*) AS n FROM memories WHERE status='active'").get().n;

// ---- FTS drift (canonique doctor: vocab 'instance' + colonne doc) ----------------
// Vocab rowids are vtab-sequential (terms/instances), NOT docids — counting via
// rowid produced fake ghost alarms (see probe history in findings.md).
// The index itself is only readable through the vocabulary side: distinct
// `doc` values of an 'instance' vocab ARE the indexed docids. integrity-check
// alone is structure-only (proven blind to bypass-delete ghosts on this
// runtime), so the diff is the drift detector and integrity-check the backup.
let drift = null;
try {
  s.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.fts_vocab USING fts5vocab('main','memories_fts','instance')");
  const indexRowids = new Set(
    s.db.prepare("SELECT DISTINCT doc AS d FROM temp.fts_vocab").all().map((r) => r.d),
  );
  const memRowids = s.db.prepare("SELECT rowid FROM memories").all().map((r) => r.rowid);
  const ghosts = [...indexRowids].filter((d) => !memRowids.includes(d)).length;
  const holes = memRowids.filter((r) => !indexRowids.has(r)).length;
  let integrity = "passed";
  try {
    s.db.prepare("INSERT INTO memories_fts(memories_fts) VALUES('integrity-check')").run();
  } catch (e) { integrity = `failed: ${String(e).slice(0, 120)}`; }
  drift = { indexed_rowids: indexRowids.size, memories_rowids: memRowids.length, ghosts, holes, integrity_check: integrity };
  s.db.exec("DROP TABLE IF EXISTS temp.fts_vocab");
} catch (e) {
  drift = { error: String(e).slice(0, 200) };
}

console.log(JSON.stringify({
  store: path,
  active,
  get: { n: getTimes.length, p50: pct(getTimes, 0.5), p95: pct(getTimes, 0.95) },
  search_identity: {
    queries: searches,
    top1_hit_rate: +(identityTop1 / searches).toFixed(2),
    top3_hit_rate: +(identityTop3 / searches).toFixed(2),
    p50: pct(searchTimes, 0.5), p95: pct(searchTimes, 0.95),
  },
  search_adversarial_word: { p50: pct(advTimes, 0.5), p95: pct(advTimes, 0.95) },
  list_where: { p50: pct(listTimes, 0.5), p95: pct(listTimes, 0.95) },
  relations_resolved: { n: relTimes.length, p50: pct(relTimes, 0.5), p95: pct(relTimes, 0.95) },
  stats: { p50: pct(statsTimes, 0.5) },
  tags: { p50: pct(tagsTimes, 0.5) },
  warm_insert: { n: 200, total_ms: +insertPer100.toFixed(0), per_op_ms: +(insertPer100 / 200).toFixed(3) },
  drift,
}, null, 2));

s.close();
