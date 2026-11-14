/**
 * `souv memory deprecate` — the retirement gesture: the memory turns
 * deprecated, a terminal, and every gesture refuses it afterward. The
 * wire serves the mute 204; the client answers with its echo of the
 * gesture (the mute verbs compose what they did) — the refusals ride
 * verbatim.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { dotSegmentRefusal } from '../dot-segment/dot-segment.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface DeprecateMemoryArgs {
  readonly id?: string;
}

export async function deprecateMemory(
  binding: Binding,
  args: DeprecateMemoryArgs,
): Promise<SouvAnswer> {
  if (missingArg(args.id)) {
    return refusalOf("the id is missing — pass the memory's id as the command's first argument");
  }
  const dot = dotSegmentRefusal(args.id);
  if (dot !== undefined) return dot;
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/memories/${encodeURIComponent(args.id)}/deprecate`,
  });
  if (answer.status === 204) {
    return { document: { id: args.id, deprecated: true }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
