/**
 * `souv memory deprecate` — the retirement gesture: the memory turns
 * deprecated, a terminal, and every gesture refuses it afterward. The
 * wire serves the mute 204; the client answers with its echo of the
 * gesture (the mute verbs compose what they did) — the refusals ride
 * verbatim.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { memoryId } from '../memory-id/memory-id.ts';

export interface DeprecateMemoryArgs {
  readonly id?: string;
}

export async function deprecateMemory(
  binding: Binding,
  args: DeprecateMemoryArgs,
): Promise<SouvAnswer> {
  const addressed = memoryId(args.id);
  if (addressed.state === 'refuse') return addressed.refusal;
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/memories/${encodeURIComponent(addressed.id)}/deprecate`,
  });
  if (answer.status === 204) {
    return { document: { id: addressed.id, deprecated: true }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
