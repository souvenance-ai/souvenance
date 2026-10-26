/**
 * Depth validation for `get`: absent means 1 (raw edges), anything else
 * must be an integer >= 1. No upper bound — the visited set guards cycles,
 * the caller owns the pace.
 */
export function normaliseDepth(depth: number | undefined): number {
  if (depth === undefined) return 1;
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error('depth must be an integer >= 1');
  }
  return depth;
}
