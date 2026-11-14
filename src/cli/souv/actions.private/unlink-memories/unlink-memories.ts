/**
 * `souv memory unlink` — the edge is gone. The ambiguity is the wire's
 * verdict: several edges to the same target need the kind, and the
 * wire's 400 names the candidates ("pass kind: a, b") — served
 * verbatim, the transport-neutral voice. The mute 204 comes back as
 * the echo of the gesture.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { dotSegmentRefusal } from '../dot-segment/dot-segment.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface UnlinkMemoriesArgs {
  readonly id?: string;
  readonly target?: string;
  readonly kind?: string;
}

export async function unlinkMemories(
  binding: Binding,
  args: UnlinkMemoriesArgs,
): Promise<SouvAnswer> {
  if (missingArg(args.id)) {
    return refusalOf("the id is missing — pass the memory's id as the command's first argument");
  }
  const dot = dotSegmentRefusal(args.id);
  if (dot !== undefined) return dot;
  if (missingArg(args.target)) {
    return refusalOf("the target is missing — pass the edge's target as --to <id>");
  }
  const body: Record<string, unknown> = { to: args.target };
  if (args.kind !== undefined) body['kind'] = args.kind;
  const answer = await httpCall(binding, {
    method: 'delete',
    path: `/memories/${encodeURIComponent(args.id)}/link`,
    body,
  });
  if (answer.status === 204) {
    return { document: { from_id: args.id, to_id: args.target, unlinked: true }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
