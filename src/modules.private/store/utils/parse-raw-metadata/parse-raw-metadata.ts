/**
 * One raw metadata column, parsed. The reads' forgiveness precedent
 * (#12): invalid JSON — hand-SQL corruption, the write surface cannot
 * produce it — collapses to `null` metadata instead of failing the
 * serving; the doctor is where the corruption speaks.
 */
export function parseRawMetadata(metadata: string | null): Record<string, unknown> | null {
  if (metadata === null) return null;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}
