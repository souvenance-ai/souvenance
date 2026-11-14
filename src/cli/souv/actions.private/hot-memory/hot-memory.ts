/**
 * `souv memory hot` — the state machine's one reversible edge: active ↔
 * hot, the curation sub-state a fresh session's checkin serves. The
 * verdict is the caller's word — on | off — judged locally (a foreign
 * word teaches, no silent mapping), carried to the wire as the boolean
 * it demands; the mute 204 comes back as the echo of the gesture.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { dotSegmentRefusal } from '../dot-segment/dot-segment.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface HotMemoryArgs {
  readonly id?: string;
  readonly verdict?: string;
}

export async function hotMemory(binding: Binding, args: HotMemoryArgs): Promise<SouvAnswer> {
  if (missingArg(args.id)) {
    return refusalOf("the id is missing — pass the memory's id as the command's first argument");
  }
  const dot = dotSegmentRefusal(args.id);
  if (dot !== undefined) return dot;
  if (missingArg(args.verdict)) {
    return refusalOf("the verdict is missing — pass on or off as the command's second argument");
  }
  if (args.verdict !== 'on' && args.verdict !== 'off') {
    return refusalOf(`the verdict is not ours — on or off, not "${args.verdict}"`);
  }
  const hot = args.verdict === 'on';
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/memories/${encodeURIComponent(args.id)}/hot`,
    body: { hot },
  });
  if (answer.status === 204) {
    return { document: { id: args.id, hot }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
