# 01-store-doctor-api

Type: grilling
Status: resolved

## Question

Where does the doctor logic live, what does it check, and how does it verify the FTS5 index without disturbing a live store?

Context: the 2026-10-15 audit validated the real store with an ad hoc script (10 checks, 1 content glitch caught). Shipping the checks as durable tooling raises three design questions:

- **Placement**: Store methods (deep-module pattern, SQL stays in the class, testable) vs SQL direct in `bin/memory.js` (no API surface, breaks encapsulation).
- **Check scope**: exactly the 10 audit checks vs adding informational extras (weight distribution, age median, search spot-checks).
- **FTS verification**: the FTS5 `integrity-check` command runs inside an INSERT — a write transaction — on a store that an agent may be writing to concurrently.

## Answer

One `doctor(opts)` method on `Store`, in `src/db.ts`. Returns a `DoctorReport`:

```ts
doctor(opts: DoctorOptions = {}): DoctorReport
```

### Checks (9 finding-producers + 1 stats block)

| check | scope | finding when |
|---|---|---|
| `broken_links` | all statuses | content references `memory://<uuid>` absent from the store |
| `orphan_edges` | all | edge with a missing `from_id` or `to_id` (hand-edited store) |
| `active_without_kind` | active | metadata null, unparseable, or missing `kind` (ritual-invisibility defect class) |
| `weight_bounds` | active | weight outside [0,1], or directive/summary kind below 0.8 |
| `invalid_metadata_json` | all | non-null metadata column that is not valid JSON |
| `status_without_bridge` | superseded/merged | no outgoing `supersedes`/`merges` edge (CLI-created statuses always have one) |
| `isolated_active` | active | zero edges in either direction (dream-relink debt) |
| `duplicate_titles` | active | two or more actives share an identical first-line `#` heading — memories without a heading are excluded (the audit's `<no heading>` false positive) |
| `fts_integrity` | whole store | FTS rowid set drifts from `memories`, or `integrity-check` throws |

The 10th audit item (edges by kind + active→superseded count) is informational only — reported in `summary`, never a finding: active→superseded edges are normal and resolve at read time (decision b89f4b17).

### Finding shape

Each finding: `{ check, id?, detail, hint }` — `id` is the implicated memory (edge findings put both endpoints in `detail`); `hint` is the one-line remediation ("update --weight", "supersede with corrected content", "memory doctor --fix rebuilds the FTS index").

### FTS strategy

`VACUUM INTO '<tmpdir>/...'` snapshot from the live connection (VACUUM INTO takes only a read transaction on the source), verification on the snapshot, snapshot deleted after. Zero write lock on the live store; cost is one temp file.

**Library discovery (during tests — supersedes the first draft of this strategy):** plain scans AND `count(*)` of an external-content FTS5 table are served *from the content table*, and `integrity-check` does not verify content sync — ghost rowids (index entries for deleted memories) are invisible to both. The rowid diff therefore runs through an **fts5vocab 'instance'** table on the snapshot (`SELECT DISTINCT doc` enumerates exactly the rowids the index holds), which sees both directions of drift: ghosts (index rowid, no content row) and holes (content row, no index entry). `integrity-check` stays as the internal-structure check. The ad hoc audit's "34 rows = 34 memories" parity was actually content-table parity and would have missed ghost corruption — the doctor's version is strictly stronger.

### Rationale

- **Library, not CLI**: reusable by tests and future tooling; SQL stays inside the deep module, same contract as `dump()` and `resolveChain()`.
- **The 10, nothing more**: v1 ships exactly what the audit proved; extras are scope creep without a demonstrated need.
- **Active-only scoping** for kind/weight/isolated/titles: superseded predecessors legitimately share titles and may drift from active rules; checking them would flood the report with normal history.

### Rejected

- **CLI-only SQL**: breaks the deep-module pattern the codebase follows.
- **Extras (distribution, age, search spot-checks)**: no demonstrated need; `stats` and the cold-reader test cover them separately.
- **Direct `integrity-check` on the live store**: takes a write lock on a store agents write to concurrently; the snapshot costs a temp file and removes the risk entirely.
- **Auto-repair of content findings**: repairs are supersede/merge decisions the agent must own; the doctor only diagnoses (see ticket 02 for the one mechanical exception).
