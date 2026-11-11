/**
 * `souv memory search` — the store's content, searched: the bare ranked
 * array verbatim (#60: no cursor, the ranking promises no stability).
 * The text is demanded; the list's filters ride — --limit, --kind,
 * --metadata passed through, --include-terminals.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';

export interface SearchMemoriesArgs {
  readonly text?: string;
  readonly limit?: number;
  readonly kind?: readonly string[];
  readonly metadata?: string;
  readonly includeTerminals?: boolean;
}

export async function searchMemories(
  binding: Binding,
  args: SearchMemoriesArgs,
): Promise<SouvAnswer> {
  if (missingArg(args.text)) {
    return {
      document: { error: "the search text is missing — pass it as the command's first argument" },
      exitCode: 1,
    };
  }
  const query = new URLSearchParams();
  query.set('q', args.text);
  if (args.limit !== undefined) query.set('limit', String(args.limit));
  for (const kind of args.kind ?? []) query.append('kind', kind);
  if (args.metadata !== undefined) query.set('metadata', args.metadata);
  if (args.includeTerminals === true) query.set('include_terminals', '');
  const answer = await httpCall(binding, { method: 'get', path: '/search', query });
  return answerOf(answer.status, answer.document);
}
