import { StoreError } from '../../store-error/store-error.ts';

/**
 * The authored metadata's key contract (#40): every object key, at every
 * depth, must be one path segment — the same grammar the metadata filter
 * composes paths from (parseMetadataSegment, its single home), so
 * everything stored stays addressable. Storing a dotted or exotic key
 * would create a silent angle the filter can never reach — refused at
 * authoring time, the error naming the key and its path. AUTHORED
 * metadata only: the structural inheritance (the tags union the
 * successor is built from) passes unvalidated — copying existing truth
 * is not authoring — and migrated rows keep their keys (the
 * summary-ceiling precedent: the obligation starts with the refonte).
 */
import { parseMetadataSegment } from '../parse-metadata-segment/parse-metadata-segment.ts';

export function validateMetadataKeys(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      validateMetadataKeys(value[index], `${path}[${index}]`);
    }
    return;
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
    validateMetadataKeys(nested, `${path}.${key}`);
  }
}
