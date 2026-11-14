/**
 * `souv memory merge` — the fusion gesture: the sources become one, the
 * content rewritten, each source keeping its `merges` bridge as
 * provenance. The sources ride the repeated --id; the ≥2 and the kind
 * the disagreeing sources demand are the wire's verdicts — the 400s
 * teach verbatim ("merge requires at least 2 memories", "sources
 * disagree on kind (a, b) — pass kind to classify the fusion").
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { jsonFlag } from '../json-flag/json-flag.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface MergeMemoriesArgs {
  readonly ids?: readonly string[];
  readonly content?: string;
  readonly kind?: string;
  readonly summary?: string;
  readonly metadata?: string;
}

export async function mergeMemories(
  binding: Binding,
  args: MergeMemoriesArgs,
): Promise<SouvAnswer> {
  if (missingArg(args.content)) {
    return refusalOf(
      "the content is missing — pass the fusion's content as the command's first argument",
    );
  }
  const metadata = jsonFlag('--metadata', args.metadata);
  if (metadata.state === 'refuse') return metadata.refusal;
  const body: Record<string, unknown> = { content: args.content };
  if (args.ids !== undefined) body['ids'] = args.ids;
  if (args.kind !== undefined) body['kind'] = args.kind;
  if (args.summary !== undefined) body['summary'] = args.summary;
  if (metadata.state === 'ride') body['metadata'] = metadata.parsed;
  const answer = await httpCall(binding, { method: 'post', path: '/merge', body });
  return answerOf(answer.status, answer.document);
}
