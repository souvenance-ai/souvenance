/**
 * The typed read filters' compilation (#40): `kind` as a bound IN list,
 * `metadata` as typed scalar equality per path. One condition per filter
 * entry — callers only ever AND whole conditions, no fragment of caller
 * input is interpolated anywhere (paths are validated to a fixed grammar
 * before composition, values are bound).
 */
import type { ReadFilters } from '../../store.ts';

/**
 * One compiled WHERE condition: the SQL fragment and the parameters it
 * binds.
 */
export interface SqlCondition {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

/**
 * One metadata path segment: an object-key level (letters, digits, `-`,
 * `_`) with an optional array index. The read filter composes paths from
 * it; the stored-key half (no index — indices address arrays, never
 * keys) is METADATA_KEY, the grammar the write surface enforces (#40).
 */
const PATH_SEGMENT = /^([A-Za-z0-9_-]+)(\[(\d+)\])?$/;

/**
 * Validates one metadata filter path and composes its JSON path from the
 * validated segments (`project.owner` → `$.project.owner`,
 * `tags[0]` → `$.tags[0]`). Refusals teach the grammar — wildcards and
 * dotted keys have no spelling here: an unbounded containment would be a
 * query language, and a dotted key would be unreachable by a dot-path
 * filter (the write surface refuses it at authoring time, #40).
 */
function compileMetadataPath(path: string): string {
  if (!path) {
    throw new Error(
      'metadata filter paths must be non-empty dot-paths ("project.owner", "tags[0]")',
    );
  }
  const composed = path
    .split('.')
    .map((segment) => {
      const match = segment.match(PATH_SEGMENT);
      if (!match) {
        throw new Error(
          `metadata filter paths accept letters, digits, "-" and "_" per segment, with optional [n] indices` +
            ` — refused: ${JSON.stringify(path)}`,
        );
      }
      return `.${match[1]}${match[2] ?? ''}`;
    })
    .join('');
  return `$${composed}`;
}

export function compileReadFilters(filters: ReadFilters): readonly SqlCondition[] {
  const conditions: SqlCondition[] = [];
  if (filters.kind !== undefined) {
    const kinds = filters.kind;
    if (!Array.isArray(kinds) || kinds.length === 0) {
      throw new Error(
        'kind filter refuses an empty list — pass kind names ("note", "log", …) or omit kind',
      );
    }
    for (const kind of kinds) {
      if (typeof kind !== 'string' || !kind) {
        throw new Error('kind filter entries must be non-empty kind names');
      }
    }
    conditions.push({
      sql: `m.kind IN (${kinds.map(() => '?').join(', ')})`,
      params: [...kinds],
    });
  }
  if (filters.metadata !== undefined) {
    const entries = Object.entries(filters.metadata);
    if (entries.length === 0) {
      throw new Error(
        'metadata filter refuses an empty object — pass at least one path/value pair or omit metadata',
      );
    }
    for (const [path, value] of entries) {
      const jsonPath = compileMetadataPath(path);
      let bound: string | number;
      if (typeof value === 'boolean') {
        bound = value ? 1 : 0;
      } else if (typeof value === 'string' || typeof value === 'number') {
        bound = value;
      } else {
        throw new Error('metadata filter values must be strings, numbers or booleans');
      }
      // The path interpolates VALIDATED segments only — no caller input
      // reaches the SQL text; the value rides as a bound parameter.
      conditions.push({
        sql:
          "json_extract(CASE WHEN json_valid(m.metadata) THEN m.metadata END, '" +
          jsonPath +
          "') = ?",
        params: [bound],
      });
    }
  }
  return conditions;
}
