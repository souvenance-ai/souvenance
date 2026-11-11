/**
 * `souv memory search` — the store's content, searched: the bare ranked
 * array verbatim (#60: no cursor, the ranking promises no stability).
 * The text is demanded; the filters ride the memory-filters shape.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { filterQuery, type MemoryFilterArgs } from '../memory-filters/memory-filters.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface SearchMemoriesArgs extends MemoryFilterArgs {
  readonly text?: string;
}

export async function searchMemories(
  binding: Binding,
  args: SearchMemoriesArgs,
): Promise<SouvAnswer> {
  if (missingArg(args.text)) {
    return refusalOf("the search text is missing — pass it as the command's first argument");
  }
  const query = filterQuery(args);
  query.set('q', args.text);
  const answer = await httpCall(binding, { method: 'get', path: '/search', query });
  return answerOf(answer.status, answer.document);
}
