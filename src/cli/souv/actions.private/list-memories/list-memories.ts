/**
 * `souv memory list` — one page of the store's memories in serving
 * order, newest first: {memories, next_after} verbatim. The caller
 * walks with --after: the peek is honest (next_after non-null exactly
 * when a next page EXISTS), no auto-walk, no --all — a script loops.
 * The filters ride the memory-filters shape.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { filterQuery, type MemoryFilterArgs } from '../memory-filters/memory-filters.ts';

export interface ListMemoriesArgs extends MemoryFilterArgs {
  readonly after?: string;
}

export async function listMemories(binding: Binding, args: ListMemoriesArgs): Promise<SouvAnswer> {
  const query = filterQuery(args);
  if (args.after !== undefined) query.set('after', args.after);
  const answer = await httpCall(binding, { method: 'get', path: '/memories', query });
  return answerOf(answer.status, answer.document);
}
