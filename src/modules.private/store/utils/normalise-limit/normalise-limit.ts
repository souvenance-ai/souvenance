/**
 * Limit validation shared by list/search/checkin: absent means the verb's
 * own default (checkin: -1, SQLite's no-cap form), anything else must be
 * an integer >= 1.
 */
export function normaliseLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be an integer >= 1');
  }
  return limit;
}
