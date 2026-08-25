export type UUID = string;

export interface Memory {
  id: UUID;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
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

export interface UpdateOptions {
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  where?: string;
  limit?: number;
}

export interface ListOptions {
  where?: string;
  limit?: number;
  offset?: number;
}

export type Direction = "in" | "out" | "both";

export interface RelationsOptions {
  direction?: Direction;
}

export interface Stats {
  memories: number;
  edges: number;
  edges_by_kind: Record<string, number>;
}

export interface SearchResult {
  id: UUID;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  rank: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagsOptions {
  where?: string;
}
