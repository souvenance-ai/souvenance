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
import { memoryId } from '../memory-id/memory-id.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface HotMemoryArgs {
  readonly id?: string;
  readonly verdict?: string;
}

export async function hotMemory(binding: Binding, args: HotMemoryArgs): Promise<SouvAnswer> {
  const addressed = memoryId(args.id);
  if (addressed.state === 'refuse') return addressed.refusal;
  if (missingArg(args.verdict)) {
    return refusalOf("the verdict is missing — pass on or off as the command's second argument");
  }
  if (args.verdict !== 'on' && args.verdict !== 'off') {
    return refusalOf(`the verdict is not ours — on or off, not "${args.verdict}"`);
  }
  const hot = args.verdict === 'on';
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/memories/${encodeURIComponent(addressed.id)}/hot`,
    body: { hot },
  });
  if (answer.status === 204) {
    return { document: { id: addressed.id, hot }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
