/**
 * The addressed id's gates, one door: the id is demanded (the
 * missing-arg door) and a dot segment is not a memory id —
 * encodeURIComponent leaves '.' and '..' unchanged, and the URL parser
 * folds /memories/<dot> into its parent route (the merged slice's
 * lesson: the discovery door answered 200 where a memory was asked).
 * The verdict carries the narrowed id when it may ride; every other
 * malformed id is the wire's verdict.
 */
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { SouvAnswer } from '../answer/answer.ts';
import { refusalOf } from '../refusal/refusal.ts';

export type MemoryIdVerdict =
  | { readonly state: 'ride'; readonly id: string }
  | { readonly state: 'refuse'; readonly refusal: SouvAnswer };

export function memoryId(id: string | undefined): MemoryIdVerdict {
  if (missingArg(id)) {
    return {
      state: 'refuse',
      refusal: refusalOf(
        "the id is missing — pass the memory's id as the command's first argument",
      ),
    };
  }
  if (id === '.' || id === '..') {
    return {
      state: 'refuse',
      refusal: refusalOf('the id is not ours — a dot segment is not a memory id'),
    };
  }
  return { state: 'ride', id };
}
