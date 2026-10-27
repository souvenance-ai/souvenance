/**
 * The typed read filters' compilation (#40): `kind` as a bound IN list,
 * `metadata` as typed scalar equality per path. One condition per filter
 * entry — callers only ever AND whole conditions, no fragment of caller
 * input is interpolated anywhere (paths are validated to a fixed grammar
 * before composition, values are bound).
 */
import { parseMetadataSegment } from '../parse-metadata-segment/parse-metadata-segment.ts';

/**
 * The metadata filter's shape: dot-path keys — segments `[A-Za-z0-9_-]+`,
 * an optional `[n]` index per level (`project.owner`, `tags[0]`) — to
 * scalar values. No wildcards: an unbounded containment would turn
 * equality into a query language (the richer search registers in the
 * backlog on observed need). Corrupted metadata — hand SQL, out of band —
 * matches nothing (the reads' forgiveness precedent, #12); the doctor is
 * where the corruption speaks.
 */
export interface MetadataFilters {
  readonly [path: string]: string | number | boolean;
}

/**
 * The typed read filters the set-serving verbs share (#19, revised in
 * #40 — the `tags` filter died unloved, never observed in the corpus):
 * `kind` narrows by the required column — IN semantics, any of the list —
 * and `metadata` narrows by typed equality on JSON paths — AND semantics
 * across paths. Both compile to bound parameters inside the facade: the
 * raw SQL `where` grant is dead, one language, no fragments through the
 * surface.
 */
export interface ReadFilters {
  readonly kind?: readonly string[];
  /**
   * Scalar equality on metadata paths: `{ project: 'souvenance' }` keeps
   * the memories whose metadata carries `project = 'souvenance'` — typed
   * equality (the JSON number 42 does not match the string '42'; JSON
   * booleans compare as 1/0), a path the memory does not carry excludes
   * it. The write surface validates every authored metadata key against
   * the same path grammar (#40): everything stored stays addressable.
   */
  readonly metadata?: MetadataFilters;
}

/**
 * One compiled WHERE condition: the SQL fragment and the parameters it
 * binds.
 */
export interface SqlCondition {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

/**
 * Validates one metadata filter path and composes its JSON path from the
 * parsed segments (`project.owner` → `$.project.owner`,
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
      const parsed = parseMetadataSegment(segment);
      if (!parsed) {
        throw new Error(
          `metadata filter paths accept letters, digits, "-" and "_" per segment, with optional [n] indices` +
            ` — refused: ${JSON.stringify(path)}`,
        );
      }
      return `.${parsed.key}${parsed.index === undefined ? '' : `[${parsed.index}]`}`;
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
