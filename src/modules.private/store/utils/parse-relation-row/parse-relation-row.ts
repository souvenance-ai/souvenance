/**
 * One edges row parsed into `Relation` — the raw graph row the
 * projections serve in both directions.
 */
import type { Relation } from '../../store.ts';
import { parseRawMetadata } from '../parse-raw-metadata/parse-raw-metadata.ts';

export interface RelationRow {
  readonly from_id: string;
  readonly to_id: string;
  readonly kind: string;
  readonly metadata: string | null;
  readonly created_at: string;
}

export function parseRelationRow(row: RelationRow): Relation {
  return {
    from_id: row.from_id,
    to_id: row.to_id,
    kind: row.kind,
    metadata: parseRawMetadata(row.metadata),
    created_at: row.created_at,
  };
}
