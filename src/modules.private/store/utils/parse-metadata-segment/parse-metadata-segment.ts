/**
 * One metadata path segment — the single grammar both surfaces speak
 * (#40): letters, digits, `-` and `_`, with an optional `[n]` array
 * index. The read filter composes dot-paths from full segments
 * (`project.owner`, `tags[0]` → json_extract paths); the write surface
 * validates every authored key against the key half — indices address
 * arrays, never keys — so everything stored stays addressable. One
 * grammar, one home: neither surface can drift from the other.
 */
export interface MetadataSegment {
  /** The object-key level — the segment without its index. */
  readonly key: string;
  /** The `[n]` array index when the segment carries one. */
  readonly index: number | undefined;
}

/**
 * Parses one segment of the metadata path grammar — `undefined` when the
 * segment is outside it. The one spelling the filter's path compilation
 * and the authored-key validation both go through.
 */
export function parseMetadataSegment(segment: string): MetadataSegment | undefined {
  const match = segment.match(/^([A-Za-z0-9_-]+)(\[(\d+)\])?$/);
  if (!match) return undefined;
  return {
    key: match[1]!,
    index: match[3] === undefined ? undefined : Number(match[3]),
  };
}
