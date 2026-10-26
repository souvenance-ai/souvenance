/**
 * One memories row parsed into `Memory` — the stored truth every
 * projected node is built from. `MemoryRow` is the raw shape the SELECTs
 * cast into; the status string is the five-state machine's vocabulary.
 */
import type { Memory, MemoryStatus } from '../../store.ts';
import { parseRawMetadata } from '../parse-raw-metadata/parse-raw-metadata.ts';

export interface MemoryRow {
  readonly id: string;
  readonly content: string;
  readonly kind: string;
  readonly summary: string | null;
  readonly metadata: string | null;
  readonly created_at: string;
  readonly status: string;
}

export function parseMemoryRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    kind: row.kind,
    summary: row.summary,
    metadata: parseRawMetadata(row.metadata),
    created_at: row.created_at,
    status: row.status as MemoryStatus,
  };
}
