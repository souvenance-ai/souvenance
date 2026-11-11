/**
 * The CLI actions' one arg gate: true when the string the bin parsed is
 * absent (or empty) — the guard's negative branch narrows the raw arg to
 * a string the downstream typed shapes demand. The two actions' shared
 * predicate, one spelling.
 */
export function missingArg(value: string | undefined): value is undefined {
  return value === undefined || value.length === 0;
}
