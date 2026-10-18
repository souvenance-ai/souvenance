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

export interface StoreOptions {
  metadata?: Record<string, unknown>;
  weight?: number;
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
  /** Memories copied from the origin (the provenance memory excluded). */
  memories: number;
  /** Relations copied from the origin. */
  edges: number;
  /** The provenance memory stored in the child at birth. */
  provenance: UUID;
}

/** The doctor's finding-producing checks. See .scratch/memory-doctor/. */
export type DoctorCheck =
  | "broken_links"
  | "orphan_edges"
  | "active_without_kind"
  | "weight_bounds"
  | "invalid_metadata_json"
  | "status_without_bridge"
  | "isolated_active"
  | "duplicate_titles"
  | "stale_handoff"
  | "fts_integrity";

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
