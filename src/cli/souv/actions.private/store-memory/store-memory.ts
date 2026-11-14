/**
 * `souv memory store` — the birth gesture: content, kind demanded, the
 * authored summary, the metadata, relations born with it, and the
 * birth curation. The local gates judge before any call (fail-fast):
 * the content and the kind by the missing-arg door, the JSON flags by
 * their own parse — the client judges only that a flag parses, the
 * wire judges the grammar. One grammar, one judge.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { jsonFlag } from '../json-flag/json-flag.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface StoreMemoryArgs {
  readonly content?: string;
  readonly kind?: string;
  readonly summary?: string;
  readonly metadata?: string;
  readonly relations?: string;
  readonly hot?: boolean;
}

export async function storeMemory(binding: Binding, args: StoreMemoryArgs): Promise<SouvAnswer> {
  if (missingArg(args.content)) {
    return refusalOf("the content is missing — pass it as the command's first argument");
  }
  if (missingArg(args.kind)) {
    return refusalOf(
      'the kind is missing — pass --kind: a memory is born classified (the vocabulary is free)',
    );
  }
  const metadata = jsonFlag('--metadata', args.metadata);
  if (metadata.refusal !== undefined) return metadata.refusal;
  const relations = jsonFlag('--relations', args.relations);
  if (relations.refusal !== undefined) return relations.refusal;
  const body: Record<string, unknown> = { content: args.content, kind: args.kind };
  if (args.summary !== undefined) body['summary'] = args.summary;
  if (metadata.parsed !== undefined) body['metadata'] = metadata.parsed;
  if (relations.parsed !== undefined) body['relations'] = relations.parsed;
  if (args.hot === true) body['hot'] = true;
  const answer = await httpCall(binding, { method: 'post', path: '/memories', body });
  return answerOf(answer.status, answer.document);
}
