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
