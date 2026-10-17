// Big-store generator: clones the REAL identity set (directives + summaries)
// from the live store, then floods a synthetic store with adversarial notes
// that deliberately reuse identity vocabulary, so BM25 is saturated and
// ranking (weight x recency) must do the work.
//
// Usage: node --experimental-strip-types .scratch/big-store/generate.mjs <size> <outPath>
//
// Honest stress assumptions (documented in findings.md):
// - store() stamps created_at = now for every memory, so recency is neutral:
//   the flood is AS RECENT as the identity set. Worst case for identity ranking.
// - Flood notes share identity tokens (recovery protocol, supersede, weight...)
//   so BM25 cannot trivially separate identity from noise.

import { Store } from "../../src/db.ts";
import { performance } from "node:perf_hooks";

const size = Number(process.argv[2] ?? 5000);
const out = process.argv[3] ?? ".scratch/big-store/store.db";

// ---- 1. Clone the identity set from the real store --------------------------
const real = Store.open({ dbPath: ".ai-memory/memory.db" });
const directives = real.list({ where: "metadata->>'$.kind' = 'directive'", limit: 20 });
const summaries = real.list({ where: "metadata->>'$.kind' = 'summary'", limit: 10 });
real.close();
const identity = [...directives, ...summaries];

// ---- 2. Build the synthetic store -------------------------------------------
const s = Store.open({ dbPath: out });

const t0 = performance.now();
const identityIds = [];
for (const mem of identity) {
  const id = s.store(mem.content, { metadata: mem.metadata ?? {}, weight: mem.weight });
  identityIds.push(id);
}
const identityMs = performance.now() - t0;

// Identity graph: each duplicated summary references each duplicated directive,
// mirroring the real store's shape (summaries link to the directives they honor).
const tLinks0 = performance.now();
for (const sum of summaries) {
  const sumId = identityIds[directives.length + summaries.indexOf(sum)];
  for (const dirId of identityIds.slice(0, directives.length)) {
    if (sumId !== dirId) s.link(sumId, dirId, "references");
  }
}

// ---- 3. Adversarial flood ----------------------------------------------------
const TOPICS = [
  "session lifecycle recommendation", "recovery protocol tuning", "FTS sanitizer edge cases",
  "relation resolution chains", "dream consolidation thresholds", "concurrent write races",
  "cold retrieval grading", "memory doctor findings", "kind inheritance on supersede",
  "tags union semantics", "weight rebalance policy", "edge ratio targets",
  "CLI flag plumbing", "metadata JSON validation", "busy timeout ordering",
  "WAL mode gotchas", "decision capture timing", "synonym enrichment",
  "fixture corruption repair", "frontier loop limits",
];
const ACTIONS = [
  "was decided after two grilling rounds", "was shipped behind an opt-in flag",
  "was validated by a fresh subagent", "was superseded by a newer design",
  "was measured at three size checkpoints", "was rejected in favor of resolution",
  "was fixed with a regression test", "was documented in SKILL.md and bin HELP",
];
const OUTCOMES = [
  "retrieval quality improved to the next grade", "the race stopped reproducing",
  "doctor findings dropped to zero", "the ranking stabilized under load",
  "the test suite stayed green", "the chain resolved to the terminal successor",
];
const ID_TOKENS = [
  "recovery protocol", "directives", "summaries", "weight", "supersede", "store",
  "search keywords", "dream", "decision", "session", "frontier", "relation",
  "metadata", "kind", "doctor", "cold-reader", "thresholds", "edge ratio",
  "concurrency", "glossary",
];
const TAGS = ["store", "retrieval", "concurrency", "fts5", "supersede", "doctor",
  "dream", "scale", "server", "cli", "tests"];

const KINDS = [
  { kind: "note", p: 0.45, weight: 0.45, title: "Note" },
  { kind: "pattern", p: 0.25, weight: 0.5, title: "Pattern" },
  { kind: "decision", p: 0.15, weight: 0.7, title: "Decision" },
  { kind: "summary", p: 0.05, weight: 0.85, title: "Summary" },
  { kind: "dream", p: 0.05, weight: 0.5, title: "Dream" },
  { kind: "preference", p: 0.05, weight: 0.6, title: "Preference" },
];
const SUPERSEDE_RATE = 0.08;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickKind() {
  const r = Math.random();
  let acc = 0;
  for (const k of KINDS) { acc += k.p; if (r < acc) return k; }
  return KINDS[0];
}
function noteBody(k) {
  const topic = pick(TOPICS);
  const kw = [pick(ID_TOKENS), pick(ID_TOKENS), pick(ID_TOKENS)].filter((v, i, a) => a.indexOf(v) === i);
  return [
    `# ${k.title}: ${topic}`,
    "",
    `${topic} ${pick(ACTIONS)}; the outcome: ${pick(OUTCOMES)}. The ${pick(ID_TOKENS)} depended on the ${pick(ID_TOKENS)}; ${pick(ID_TOKENS)} and recency stayed consistent across the ${pick(TOPICS)}.`,
    "",
    `Keywords: ${topic}, ${kw.join(", ")}, weight, store.`,
  ].join("\n");
}

const pools = new Map(); // kind -> recent ids, for supersede targets
const prevIds = [];
let inserted = 0;
let supersededCount = 0;

const tFlood = performance.now();
let lastMark = tFlood;
const perKMs = [];
let target = size; // total rows (identity + flood), supersede rows included

while (inserted + identity.length < target) {
  const k = pickKind();
  const metadata = { kind: k.kind, tags: [pick(TAGS), pick(TAGS)].filter((v, i, a) => a.indexOf(v) === i) };

  if (Math.random() < SUPERSEDE_RATE) {
    const pool = pools.get(k.kind);
    if (pool && pool.length > 0) {
      const oldId = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      s.supersede(oldId, noteBody(k), { metadata, weight: k.weight });
      supersededCount++;
      inserted++;
      if (inserted % 1000 === 0) {
        perKMs.push(performance.now() - lastMark);
        lastMark = performance.now();
      }
      continue;
    }
  }

  const id = s.store(noteBody(k), { metadata, weight: k.weight });
  inserted++;
  if (!pools.has(k.kind)) pools.set(k.kind, []);
  pools.get(k.kind).push(id);
  prevIds.push(id);
  if (prevIds.length > 400) prevIds.shift();

  // ~2.2 edges per active memory to mirror the real store's graph density
  const nEdges = Math.random() < 0.2 ? 3 : 2;
  for (let e = 0; e < nEdges; e++) {
    const to = prevIds[Math.floor(Math.random() * prevIds.length)];
    if (to && to !== id) s.link(id, to, Math.random() < 0.7 ? "references" : "extends");
  }

  if (inserted % 1000 === 0) {
    perKMs.push(performance.now() - lastMark);
    lastMark = performance.now();
  }
}
const floodMs = performance.now() - tFlood;

const stats = s.stats();
s.close();

console.log(JSON.stringify({
  out, size, identityCount: identity.length, inserted,
  supersededCount, edges: stats.edges, active_memories: stats.active_memories,
  memories: stats.memories, edge_ratio: +(stats.edges / stats.active_memories).toFixed(2),
  identityMs: +identityMs.toFixed(0), floodMs: +floodMs.toFixed(0),
  insert_ms_per_1k: perKMs.map((m) => +m.toFixed(0)),
}, null, 2));
