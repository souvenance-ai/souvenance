/**
 * The addressed id's gates, one door: the id is demanded (the
 * missing-arg door) and a dot segment is not a memory id — the shared
 * judge's lesson (the merged slice's: the URL parser folds /<dot> into
 * its parent route). The verdict carries the narrowed id when it may
 * ride; every other malformed id is the wire's verdict.
 */
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { SouvAnswer } from '../answer/answer.ts';
import { isDotSegment } from '../dot-segment/dot-segment.ts';
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
  if (isDotSegment(id)) {
    return {
      state: 'refuse',
      refusal: refusalOf('the id is not ours — a dot segment is not a memory id'),
    };
  }
  return { state: 'ride', id };
}
