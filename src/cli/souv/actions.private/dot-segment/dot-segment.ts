/**
 * The addressed id's one local gate: a dot segment is not a memory id —
 * encodeURIComponent leaves '.' and '..' unchanged, and the URL parser
 * folds /memories/<dot> into its parent route (the merged slice's
 * lesson: the discovery door answered 200 where a memory was asked).
 * The gate refuses before any URL exists; every other malformed id is
 * the wire's verdict. Undefined when the id may ride.
 */
import type { SouvAnswer } from '../answer/answer.ts';
import { refusalOf } from '../refusal/refusal.ts';

export function dotSegmentRefusal(id: string): SouvAnswer | undefined {
  return id === '.' || id === '..'
    ? refusalOf('the id is not ours — a dot segment is not a memory id')
    : undefined;
}
