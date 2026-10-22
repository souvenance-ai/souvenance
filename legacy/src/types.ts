export type UUID = string;

export type MemoryStatus = "active" | "superseded" | "deprecated" | "merged";

export interface Memory {
  id: UUID;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  status: MemoryStatus;
  weight: number;
  access_count: number;
}

export interface Relation {
  from_id: UUID;
  to_id: UUID;
  kind: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  /** Present only when resolve was requested and the target is superseded/merged:
   *  the terminal successor reached by following the supersedes/merges bridges. */
  resolved_to?: UUID;
}

/** Both directions of one memory's edges, raw (no resolution — resolved_to
 *  stays opt-in via the relations verb's --resolved). The read-side
 *  projection that lets content be self-sufficient: the graph is the
 *  single relation surface, and reading surfaces project it (see
 *  .scratch/single-write-graph/). */
export interface RelationsBlock {
  out: Relation[];
  in: Relation[];
}

/** A memory carrying its projects-at-read relations block (get, and the
 *  summaries inside recover). */
export type MemoryWithRelations = Memory & { relations: RelationsBlock };

export interface RecoverOptions {
  /** Cap on the returned directives (default 20). */
  directivesLimit?: number;
  /** Cap on the returned summaries (default 3). */
  summariesLimit?: number;
  /** Cap on the returned open objectives (default 10). */
  objectivesLimit?: number;
}

/** The recovery ritual in one call — directives, summaries, open objectives
 *  and stats, exactly the composition the HTTP GET /recover and the MCP
 *  recover tool serve. Each summary carries its direct edges (RelationsBlock)
 *  so a fresh session's frontier starts with zero drill-in calls. */
export interface RecoverReport {
  directives: Memory[];
  summaries: MemoryWithRelations[];
  objectives: Memory[];
  stats: Stats;
}

/** One outgoing edge authored in the same gesture as the memory itself —
 *  the one-gesture write that retires the prose-citation practice (see
 *  .scratch/single-write-graph/). The `link` verb stays for arbitrary
 *  edges: reverse directions, retro-fixes, cross-memory repairs. */
export interface RelationSpec {
  to: UUID;
  kind: string;
}

export interface StoreOptions {
  metadata?: Record<string, unknown>;
  weight?: number;
  /** Outgoing edges created in the same call (store: to the new memory;
   *  supersede: to the NEW memory — the old→new supersedes edge still
   *  happens). Per-edge validation identical to link. */
  relations?: RelationSpec[];
}

export interface UpdateOptions {
  metadata?: Record<string, unknown>;
  weight?: number;
}

export interface SearchOptions {
  where?: string;
  limit?: number;
  includeLegacy?: boolean;
}

export interface ListOptions {
  where?: string;
  limit?: number;
  offset?: number;
  includeLegacy?: boolean;
  minWeight?: number;
}

export type Direction = "in" | "out" | "both";

export interface RelationsOptions {
  direction?: Direction;
  /** Annotate relations whose target is superseded/merged with resolved_to
   *  (the terminal successor via the supersedes/merges bridges). Default off. */
  resolve?: boolean;
}

export interface Stats {
  memories: number;
  active_memories: number;
  memories_by_status: Record<string, number>;
  edges: number;
  edges_by_kind: Record<string, number>;
  total_accesses: number;
}

export interface SearchResult {
  id: UUID;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  status: MemoryStatus;
  weight: number;
  access_count: number;
  rank: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagsOptions {
  where?: string;
  includeLegacy?: boolean;
}

export interface ForkOptions {
  /** Overwrite an existing target file (and its WAL sidecars). Default off —
   *  a fork never clobbers an existing store silently. */
  force?: boolean;
}

export interface ForkResult {
  /** Absolute path of the forked store. */
  path: string;
  /** Memories copied (all statuses) — an exact copy: nothing added. */
  memories: number;
  /** Relations copied. */
  edges: number;
}

/** The doctor's finding-producing checks. See .scratch/memory-doctor/ and
 *  .scratch/single-write-graph/ (broken_links retired: a dead memory://
 *  prose link is history, not corruption — the edges table is the single
 *  relation surface and its own integrity checker). */
export type DoctorCheck =
  | "orphan_edges"
  | "self_edges"
  | "active_without_kind"
  | "weight_bounds"
  | "invalid_metadata_json"
  | "status_without_bridge"
  | "isolated_active"
  | "duplicate_titles"
  | "stale_handoff"
  | "fts_integrity"
  | "file_permissions";

export interface DoctorFinding {
  check: DoctorCheck;
  /** Implicated memory id (edge findings name both endpoints in detail). */
  id?: UUID;
  detail: string;
  /** One-line remediation, ready to act on. */
  hint: string;
}

export interface DoctorOptions {
  /** Rebuild the FTS5 index on the live store before checking — the one
   *  mechanical repair (no content rewrite). Default off. */
  fix?: boolean;
}

export interface DoctorReport {
  healthy: boolean;
  findings: DoctorFinding[];
  summary: {
    checks: number;
    issues: number;
    memories: number;
    edges: number;
    edges_by_kind: Record<string, number>;
    /** Informational, never a finding: normal history, resolved at read time. */
    active_to_superseded: number;
    fts_rebuilt: boolean;
  };
}

/** The finish ritual's own checks: session obligations the store-timeless
 *  doctor is deliberately blind to (it validates the store, not the
 *  session). Doctor findings propagate into a finish report with their own
 *  check names intact, blocked as a gate. */
export type FinishCheck = DoctorCheck | "session_summary" | "experience_note" | "dream_debt";

export interface FinishFinding {
  check: FinishCheck;
  /** Implicated memory id where one exists. */
  id?: UUID;
  detail: string;
  /** One-line remediation, ready to act on. */
  hint: string;
  /** "block" fails the verdict (exit 1). "warn" is reported, never blocking:
   *  judgment debts (the dream) stay the agent's to pay or argue aloud. */
  severity: "block" | "warn";
}

export interface FinishReport {
  healthy: boolean;
  findings: FinishFinding[];
  summary: {
    /** The session window, in hours. */
    window_hours: number;
    /** Memories stored within the window (any status — stored is stored). */
    window_memories: number;
    /** created_at of the newest kind:"dream" memory, null when none exists. */
    last_dream: string | null;
    /** Memories created after the last dream (volume + session-end lines). */
    memories_since_dream: number;
    /** Blocking findings — the verdict. */
    blocks: number;
    /** Reported judgment debts — never blocking. */
    warns: number;
    /** The composed doctor gate. */
    doctor: { checks: number; issues: number };
  };
}
