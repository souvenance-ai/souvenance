/**
 * `souv checkout` — the session-end verdict: the store reports its
 * consolidation debts — the hot block missing, living memories without
 * edges, duplicate titles — each payable with the write verbs; healthy
 * lands true only when every debt is paid. Served verbatim.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';

export async function checkout(binding: Binding): Promise<SouvAnswer> {
  const answer = await httpCall(binding, { method: 'get', path: '/checkout' });
  return answerOf(answer.status, answer.document);
}
