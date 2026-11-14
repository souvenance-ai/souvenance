/**
 * `souv memory supersede` — the revision gesture: the content moves to a
 * successor, the old turns superseded (a terminal), the kind rides along
 * unless the body reclassifies, and the source's outgoing edges inherit
 * verbatim when the body births no new ones. The local gates judge
 * before any call (fail-fast); the wire judges the grammar.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { memoryId } from '../memory-id/memory-id.ts';
import { jsonFlag } from '../json-flag/json-flag.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface SupersedeMemoryArgs {
  readonly id?: string;
  readonly content?: string;
  readonly kind?: string;
  readonly summary?: string;
  readonly metadata?: string;
  readonly relations?: string;
}

export async function supersedeMemory(
  binding: Binding,
  args: SupersedeMemoryArgs,
): Promise<SouvAnswer> {
  const addressed = memoryId(args.id);
  if (addressed.state === 'refuse') return addressed.refusal;
  if (missingArg(args.content)) {
    return refusalOf(
      "the content is missing — pass the successor's content as the command's second argument",
    );
  }
  const metadata = jsonFlag('--metadata', args.metadata);
  if (metadata.state === 'refuse') return metadata.refusal;
  const relations = jsonFlag('--relations', args.relations);
  if (relations.state === 'refuse') return relations.refusal;
  const body: Record<string, unknown> = { content: args.content };
  if (args.kind !== undefined) body['kind'] = args.kind;
  if (args.summary !== undefined) body['summary'] = args.summary;
  if (metadata.state === 'ride') body['metadata'] = metadata.parsed;
  if (relations.state === 'ride') body['relations'] = relations.parsed;
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/memories/${encodeURIComponent(addressed.id)}/supersede`,
    body,
  });
  return answerOf(answer.status, answer.document);
}
