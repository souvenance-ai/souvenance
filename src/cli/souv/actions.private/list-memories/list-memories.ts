/**
 * `souv memory list` — one page of the store's memories in serving
 * order, newest first: {memories, next_after} verbatim. The caller
 * walks with --after: the peek is honest (next_after non-null exactly
 * when a next page EXISTS), no auto-walk, no --all — a script loops.
 * The filters ride: --kind repeatable (the wire's IN — a lone --kind is
 * its singleton), --metadata one JSON document passed through (the
 * wire judges the grammar), --include-terminals a presence flag.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';

export interface ListMemoriesArgs {
  readonly after?: string;
  readonly limit?: number;
  readonly kind?: readonly string[];
  readonly metadata?: string;
  readonly includeTerminals?: boolean;
}

export async function listMemories(binding: Binding, args: ListMemoriesArgs): Promise<SouvAnswer> {
  const query = new URLSearchParams();
  if (args.after !== undefined) query.set('after', args.after);
  if (args.limit !== undefined) query.set('limit', String(args.limit));
  for (const kind of args.kind ?? []) query.append('kind', kind);
  if (args.metadata !== undefined) query.set('metadata', args.metadata);
  if (args.includeTerminals === true) query.set('include_terminals', '');
  const answer = await httpCall(binding, { method: 'get', path: '/memories', query });
  return answerOf(answer.status, answer.document);
}
