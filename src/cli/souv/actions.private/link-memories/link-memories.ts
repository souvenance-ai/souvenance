/**
 * `souv memory link` — one directed edge, born with its kind: from the
 * addressed memory to the --to target. The kind is demanded locally
 * (the edge is born classified — the birth kind's precedent); the edge
 * metadata is one JSON document judged by the wire; the 201's echo is
 * the wire's own (from_id, to_id, kind) — forwarded verbatim.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { memoryId } from '../memory-id/memory-id.ts';
import { jsonFlag } from '../json-flag/json-flag.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface LinkMemoriesArgs {
  readonly id?: string;
  readonly target?: string;
  readonly kind?: string;
  readonly metadata?: string;
}

export async function linkMemories(binding: Binding, args: LinkMemoriesArgs): Promise<SouvAnswer> {
  const addressed = memoryId(args.id);
  if (addressed.state === 'refuse') return addressed.refusal;
  if (missingArg(args.target)) {
    return refusalOf("the target is missing — pass the edge's target as --to <id>");
  }
  if (missingArg(args.kind)) {
    return refusalOf('the kind is missing — an edge is born classified (pass --kind)');
  }
  const metadata = jsonFlag('--metadata', args.metadata);
  if (metadata.refusal !== undefined) return metadata.refusal;
  const body: Record<string, unknown> = { to: args.target, kind: args.kind };
  if (metadata.parsed !== undefined) body['metadata'] = metadata.parsed;
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/memories/${encodeURIComponent(addressed.id)}/link`,
    body,
  });
  return answerOf(answer.status, answer.document);
}
