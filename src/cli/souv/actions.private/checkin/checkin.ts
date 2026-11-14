/**
 * `souv checkin` — the session-start ritual: the hot memories with
 * their relations, the store's stats, the waking guidance — one call,
 * newest first, served verbatim. Reading the register is not writing
 * it: read-only grants open here. The explicit limit has no ceiling —
 * the session block follows "order guides attention, nothing drops";
 * the wire's own shape judges (integer ≥ 1).
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';

export interface CheckinArgs {
  readonly limit?: number;
}

export async function checkin(binding: Binding, args: CheckinArgs): Promise<SouvAnswer> {
  const query = new URLSearchParams();
  if (args.limit !== undefined) query.set('limit', String(args.limit));
  const answer = await httpCall(binding, {
    method: 'get',
    path: '/checkin',
    query: query.size > 0 ? query : undefined,
  });
  return answerOf(answer.status, answer.document);
}
