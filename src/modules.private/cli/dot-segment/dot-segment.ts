/**
 * The dot-segment judge, shared by the segment-addressed doors of both
 * bins: '.' and '..' are not segment payloads — encodeURIComponent
 * leaves them unchanged, and the URL parser folds /<dot> into the
 * parent route (the merged slice's lesson: the discovery door answered
 * 200 where a memory was asked). Each door composes its own verdict
 * voice; this is only the judge.
 */
export function isDotSegment(segment: string): boolean {
  return segment === '.' || segment === '..';
}
