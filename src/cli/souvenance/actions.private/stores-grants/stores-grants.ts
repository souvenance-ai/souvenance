/**
 * The manager's `stores grants` trio (the slice's three verbs, #105):
 * the wire door's mint, list and revoke (#98) as the operator's remote
 * gesture — the same trio the offline `grant` family teaches while the
 * server runs. The store name rides the URL (the transport's dot gate);
 * the mint's agent and mode ride the body — the wire's own grammar
 * judges them (the mint door refuses the dot agents and the wrong
 * modes with its teaching, forwarded verbatim). The mint serves the
 * response verbatim — the secret included, NO TTY gate: the wire door
 * serves what the wire serves, the TTY rule is the offline door's
 * posture, the wire mint exists for programs (#98). The revoke's 204
 * serves the gesture's echo — `{agent, store, revoked: true}`, the
 * mirror of the delete's (the echo of #49's ruling 10).
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { answerOf, type AnswerOf } from '../../../../modules.private/cli/answer-of/answer-of.ts';
import { isDotSegment } from '../../../../modules.private/cli/dot-segment/dot-segment.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import {
  AGENT_REQUIRED,
  DOT_AGENT_REFUSAL,
  MODE_TEACHING,
} from '../../../../modules.private/config/mint-doors/mint-doors.ts';
import { DOT_STORE_REFUSAL } from '../stores/stores.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface StoresGrantsMintArgs {
  readonly store?: string;
  readonly agent?: string;
  readonly mode?: string;
}

export async function storesGrantsMint(
  binding: Binding,
  args: StoresGrantsMintArgs,
): Promise<AnswerOf> {
  if (missingArg(args.store)) {
    return refusalOf('the store name is missing — pass it as the command\u2019s first argument');
  }
  if (isDotSegment(args.store)) return refusalOf(DOT_STORE_REFUSAL);
  if (missingArg(args.agent)) return refusalOf(AGENT_REQUIRED);
  if (missingArg(args.mode)) return refusalOf(MODE_TEACHING);
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/stores/${encodeURIComponent(args.store)}/grants`,
    body: { agent: args.agent, mode: args.mode },
  });
  return answerOf(answer.status, answer.document);
}

export interface StoresGrantsListArgs {
  readonly store?: string;
}

export async function storesGrantsList(
  binding: Binding,
  args: StoresGrantsListArgs,
): Promise<AnswerOf> {
  if (missingArg(args.store)) {
    return refusalOf('the store name is missing — pass it as the command\u2019s first argument');
  }
  if (isDotSegment(args.store)) return refusalOf(DOT_STORE_REFUSAL);
  const answer = await httpCall(binding, {
    method: 'get',
    path: `/stores/${encodeURIComponent(args.store)}/grants`,
  });
  return answerOf(answer.status, answer.document);
}

export interface StoresGrantsRevokeArgs {
  readonly store?: string;
  readonly agent?: string;
}

export async function storesGrantsRevoke(
  binding: Binding,
  args: StoresGrantsRevokeArgs,
): Promise<AnswerOf> {
  if (missingArg(args.store)) {
    return refusalOf('the store name is missing — pass it as the command\u2019s first argument');
  }
  if (isDotSegment(args.store)) return refusalOf(DOT_STORE_REFUSAL);
  if (missingArg(args.agent)) return refusalOf(AGENT_REQUIRED);
  if (isDotSegment(args.agent)) return refusalOf(DOT_AGENT_REFUSAL);
  const answer = await httpCall(binding, {
    method: 'delete',
    path: `/stores/${encodeURIComponent(args.store)}/grants/${encodeURIComponent(args.agent)}`,
  });
  // The gesture's echo, the revoke's own: the mirror of the delete's.
  if (answer.status === 204) {
    return { document: { agent: args.agent, store: args.store, revoked: true }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
