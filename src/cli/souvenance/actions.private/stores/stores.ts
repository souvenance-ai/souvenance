/**
 * The manager's `stores` family (the slice's five verbs, #105): the
 * management surface's store gestures as the operator's remote gesture
 * — the wire judges, the client forwards. The binding is the manager's
 * own (config-first, the env overrides); every wire refusal rides
 * verbatim in the one envelope; a 2xx exits 0, anything else 1. The
 * URL-riding names are gated locally for the transport's sake, not the
 * grammar's (the family's own door voice, `store-doors`); the bodies
 * (create's name, fork's target) ride to the wire unjudged — the wire's
 * grammar teaches. No `--grant` chaining on the fork: the birth mint is
 * the offline door's (the copy's own), the wire's fork is born
 * unreached, remote minting is the grants trio. The delete's 204 serves
 * the gesture's echo — `{name, deleted: true}` (the echo of #49's
 * ruling 10): the contract's one document per invocation, spoken where
 * the wire serves none.
 */
import { answerOf, type AnswerOf } from '../../../../modules.private/cli/answer-of/answer-of.ts';
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import { refusalOf } from '../../../../modules.private/cli/refusal-of/refusal-of.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { STORE_NAME_MISSING, storeNameGate } from '../store-doors/store-doors.ts';

export interface StoresCreateArgs {
  readonly name?: string;
}

export async function storesCreate(binding: Binding, args: StoresCreateArgs): Promise<AnswerOf> {
  // The name rides the body — the missing door only; the wire's grammar
  // judges every value, dot segments included (the transport's fold is
  // a URL problem, and a body has none).
  if (missingArg(args.name)) return refusalOf(STORE_NAME_MISSING);
  const answer = await httpCall(binding, {
    method: 'post',
    path: '/stores',
    body: { name: args.name },
  });
  return answerOf(answer.status, answer.document);
}

export async function storesList(binding: Binding): Promise<AnswerOf> {
  const answer = await httpCall(binding, { method: 'get', path: '/stores' });
  return answerOf(answer.status, answer.document);
}

export interface StoresNameArgs {
  readonly name?: string;
}

export async function storesDescribe(binding: Binding, args: StoresNameArgs): Promise<AnswerOf> {
  const gate = storeNameGate(args.name);
  if (gate.state === 'refuse') return gate.refusal;
  const answer = await httpCall(binding, {
    method: 'get',
    path: `/stores/${encodeURIComponent(gate.name)}`,
  });
  return answerOf(answer.status, answer.document);
}

export interface StoresForkArgs {
  readonly source?: string;
  readonly target?: string;
}

export async function storesFork(binding: Binding, args: StoresForkArgs): Promise<AnswerOf> {
  const gate = storeNameGate(args.source);
  if (gate.state === 'refuse') return gate.refusal;
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/stores/${encodeURIComponent(gate.name)}/fork`,
    body: missingArg(args.target) ? undefined : { name: args.target },
  });
  return answerOf(answer.status, answer.document);
}

export async function storesDelete(binding: Binding, args: StoresNameArgs): Promise<AnswerOf> {
  const gate = storeNameGate(args.name);
  if (gate.state === 'refuse') return gate.refusal;
  const answer = await httpCall(binding, {
    method: 'delete',
    path: `/stores/${encodeURIComponent(gate.name)}`,
  });
  // The gesture's echo (#49's ruling 10): the wire serves none — the
  // contract's one document per invocation names what the gesture did.
  if (answer.status === 204) {
    return { document: { name: gate.name, deleted: true }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
