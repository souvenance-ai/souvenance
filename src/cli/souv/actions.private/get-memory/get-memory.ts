/**
 * `souv memory get` — one memory as its projection: the node with its
 * out-edges expanded to ?depth, the in-edges raw rows. The id rides
 * the path, encoded; a malformed id is the wire's refusal, served
 * verbatim. Absent id: the missing-arg door.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface GetMemoryArgs {
  readonly id?: string;
  readonly depth?: number;
}

export async function getMemory(binding: Binding, args: GetMemoryArgs): Promise<SouvAnswer> {
  if (missingArg(args.id)) {
    return refusalOf("the id is missing — pass the memory's id as the command's first argument");
  }
  const query = new URLSearchParams();
  if (args.depth !== undefined) query.set('depth', String(args.depth));
  const answer = await httpCall(binding, {
    method: 'get',
    path: `/memories/${encodeURIComponent(args.id)}`,
    query: query.size > 0 ? query : undefined,
  });
  return answerOf(answer.status, answer.document);
}
