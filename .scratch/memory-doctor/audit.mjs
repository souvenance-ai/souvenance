// Store integrity audit — read-only against the real store, except the
// FTS integrity-check which runs on a VACUUM INTO snapshot in /tmp.
import { DatabaseSync } from "node:sqlite";

const DB = ".ai-memory/memory.db";
const SNAP = "/tmp/opencode/audit-snap.db";

const db = new DatabaseSync(DB, { readOnly: true });
db.exec("PRAGMA busy_timeout = 5000");

const report = {};
const mems = db
  .prepare(
    `SELECT id, content, metadata, created_at, status, weight, access_count FROM memories`,
  )
  .all();
const byId = new Map(mems.map((m) => [m.id, m]));
const edges = db.prepare(`SELECT from_id, to_id, kind, created_at FROM edges`).all();

// 1. Broken memory:// links (any status, links are authored text)
const broken = [];
const linkRe = /memory:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;
for (const m of mems) {
  for (const match of m.content.matchAll(linkRe)) {
    if (!byId.has(match[1]))
      broken.push({ from: m.id, fromStatus: m.status, target: match[1] });
  }
}
report.brokenLinks = { count: broken.length, items: broken };

// 2. Orphaned edges (FK violation — should be impossible, but hand-edits exist)
const orphanEdges = edges.filter((e) => !byId.has(e.from_id) || !byId.has(e.to_id));
report.orphanEdges = { count: orphanEdges.length, items: orphanEdges };

// 3. Active memories with metadata null / missing kind
const kindless = mems.filter((m) => {
  if (m.status !== "active") return false;
  if (m.metadata == null) return true;
  try {
    const md = JSON.parse(m.metadata);
    return !md.kind;
  } catch {
    return true; // invalid JSON counts here too
  }
});
report.activeWithoutKind = {
  count: kindless.length,
  items: kindless.map((m) => ({
    id: m.id,
    metadata: m.metadata,
    title: (m.content.match(/^#.*$/m) || [""])[0].slice(0, 60),
  })),
};

// 4. Weight sanity
const weightIssues = mems.filter(
  (m) =>
    m.status === "active" &&
    ((m.weight < 0 || m.weight > 1) ||
      (/kind("|')?\s*:\s*("|')?(directive|summary)/.test(m.metadata ?? "") &&
        m.weight < 0.8)),
);
report.weightIssues = {
  count: weightIssues.length,
  items: weightIssues.map((m) => ({
    id: m.id,
    weight: m.weight,
    metadata: m.metadata,
  })),
};

// 5. Invalid metadata JSON (any status)
const badJson = mems.filter((m) => {
  if (m.metadata == null) return false;
  try {
    JSON.parse(m.metadata);
    return false;
  } catch {
    return true;
  }
});
report.invalidMetadataJson = {
  count: badJson.length,
  items: badJson.map((m) => ({ id: m.id, metadata: m.metadata })),
};

// 6. Superseded/merged memories with no outgoing supersedes/merges edge
//    (CLI-created ones always have one; hand-made statuses may not)
const noBridge = mems.filter(
  (m) =>
    (m.status === "superseded" || m.status === "merged") &&
    !edges.some(
      (e) => e.from_id === m.id && (e.kind === "supersedes" || e.kind === "merges"),
    ),
);
report.statusWithoutBridge = {
  count: noBridge.length,
  items: noBridge.map((m) => ({ id: m.id, status: m.status })),
};

// 7. Isolated active memories (no edges either direction)
const isolated = mems.filter(
  (m) =>
    m.status === "active" &&
    !edges.some((e) => e.from_id === m.id || e.to_id === m.id),
);
report.isolatedActive = {
  count: isolated.length,
  items: isolated.map((m) => ({
    id: m.id,
    title: (m.content.match(/^#.*$/m) || [""])[0].slice(0, 60),
    created: m.created_at,
  })),
};

// 8. Near-duplicates: same first heading line
const byTitle = new Map();
for (const m of mems) {
  const t = (m.content.match(/^#.*$/m) || ["<no heading>"])[0].trim();
  if (!byTitle.has(t)) byTitle.set(t, []);
  byTitle.get(t).push({ id: m.id, status: m.status });
}
report.sameTitleGroups = [...byTitle.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([t, v]) => ({ title: t, members: v }));

// 9. Edges by kind + active→superseded stale edges (read-time resolution fodder)
const byKind = {};
for (const e of edges) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
const stale = edges.filter(
  (e) => byId.get(e.to_id)?.status === "superseded" && byId.get(e.from_id)?.status === "active",
);
report.edges = { total: edges.length, byKind, activeToSuperseded: stale.length };

// 10. FTS integrity — on a snapshot copy (integrity-check needs a write txn)
try {
  const w = new DatabaseSync(DB);
  w.exec("PRAGMA busy_timeout = 5000");
  w.exec(`VACUUM INTO '${SNAP}'`);
  w.close();
  const s = new DatabaseSync(SNAP);
  try {
    s.exec(`INSERT INTO memories_fts(memories_fts) VALUES('integrity-check')`);
    report.ftsIntegrity = "ok";
  } catch (err) {
    report.ftsIntegrity = `CORRUPT: ${err.message}`;
  }
  const ftsRows = s.prepare(`SELECT count(*) AS n FROM memories_fts`).get();
  report.ftsRows = ftsRows.n;
  s.close();
} catch (err) {
  report.ftsIntegrity = `skipped: ${err.message}`;
}

db.close();
console.log(JSON.stringify(report, null, 2));
