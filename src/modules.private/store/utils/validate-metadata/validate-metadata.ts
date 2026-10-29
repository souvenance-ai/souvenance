import { StoreError } from '../../store-error/store-error.ts';

/**
 * The authored metadata's contract (#40, the values half landed by #51's
 * wire finding): every key, at every depth, one path segment — the same
 * grammar the metadata filter composes paths from (parseMetadataSegment,
 * its single home) — and every leaf a value the filter's typed equality
 * can ask for: strings, numbers, booleans, or a nested object of them.
 *
 * The refusals are the one-grammar principle, not taste. An array stores
 * facts the filter can never serve: `arr.0` reads as an object key (a
 * digit segment names keys, not indices) and whole-value comparison
 * refuses non-scalars — storing one creates exactly the dead weight the
 * key half was written to kill. Null asks for an equality the filter
 * does not carry (absence is expressed by omitting the key) — and so do
 * non-finite numbers, which JSON.stringify carries as null. All refused
 * at authoring, the error naming the value's path.
 *
 * AUTHORED metadata only: the structural inheritance passes unvalidated —
 * copying existing truth is not authoring — and migrated rows keep their
 * values verbatim (the summary-ceiling precedent: the obligation starts
 * with the refonte).
 */
import { parseMetadataSegment } from '../parse-metadata-segment/parse-metadata-segment.ts';

/** The teachings ride once: the refusals the agent reads on every surface. */
const arraysRefusal = (path: string): string =>
  `metadata values may not be arrays — the filter cannot address them by index or compare them whole` +
  ` (#40, #51) — refused: ${path}`;
const nullRefusal = (path: string): string =>
  `metadata values may not be null — the filter cannot ask for null (#51) — omit ${path} to say nothing`;
const nonFiniteRefusal = (path: string): string =>
  `metadata values may not be non-finite numbers — JSON.stringify carries them as the null the filter cannot ask for (#51)` +
  ` — omit ${path} to say nothing`;

export function validateMetadata(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    throw new StoreError('invalid', arraysRefusal(path));
  }
  for (const [key, nested] of Object.entries(value)) {
    // The key half of the grammar only: an object key never carries the
    // `[n]` index — indices address arrays, never keys.
    const parsed = parseMetadataSegment(key);
    if (!parsed || parsed.index !== undefined) {
      throw new StoreError(
        'invalid',
        `metadata keys accept letters, digits, "-" and "_" — the metadata filter's path grammar (#40)` +
          ` — refused: ${JSON.stringify(key)} at ${path}`,
      );
    }
    const nestedPath = `${path}.${key}`;
    if (nested === null) {
      throw new StoreError('invalid', nullRefusal(nestedPath));
    }
    if (typeof nested === 'number' && !Number.isFinite(nested)) {
      throw new StoreError('invalid', nonFiniteRefusal(nestedPath));
    }
    if (Array.isArray(nested)) {
      throw new StoreError('invalid', arraysRefusal(nestedPath));
    }
    validateMetadata(nested, nestedPath);
  }
}
