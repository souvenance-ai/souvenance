export type UUID = string;

export type MemoryStatus = "active" | "superseded" | "deprecated" | "merged";

export interface Memory {
  id: UUID;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  status: MemoryStatus;
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
}

export interface SearchResult {
  id: UUID;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  status: MemoryStatus;
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
