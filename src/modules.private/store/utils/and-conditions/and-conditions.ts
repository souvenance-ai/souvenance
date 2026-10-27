/**
 * The one AND-join the set-serving verbs share: the compiled conditions
 * become a single clause — the SQL text and its bound parameters travel
 * together, in order. Callers concatenate the fragment onto the WHERE /
 * MATCH they already hold and spread the parameters; no caller input is
 * interpolated — every condition binds its own.
 */
import type { SqlCondition } from '../compile-read-filters/compile-read-filters.ts';

export function andConditions(conditions: readonly SqlCondition[]): SqlCondition {
  return {
    sql: conditions.map((condition) => condition.sql).join(' AND '),
    params: conditions.flatMap((condition) => [...condition.params]),
  };
}
