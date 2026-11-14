/**
 * The manager's `stores` family (the slice's five verbs, #105): the
 * management surface's store gestures as the operator's remote gesture
 * — the wire judges, the client forwards. The binding is the manager's
 * own (config-first, the env overrides); every wire refusal rides
 * verbatim in the one envelope; a 2xx exits 0, anything else 1. The
 * URL-riding names are gated locally for the transport's sake, not the
 * grammar's: a dot segment is folded by the URL parser into the parent
 * route (the shared judge's lesson) — the wire's 404 would never be
 * asked. The bodies (create's name, fork's target) ride to the wire
 * unjudged — the wire's grammar teaches. No `--grant` chaining on the
 * fork: the birth mint is the offline door's (the copy's own), the
 * wire's fork is born unreached, remote minting is the grants trio.
 * The delete's 204 serves the gesture's echo — `{name, deleted: true}`
 * (the echo of #49's ruling 10): the contract's one document per
 * invocation, spoken where the wire serves none.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { answerOf, type AnswerOf } from '../../../../modules.private/cli/answer-of/answer-of.ts';
import { isDotSegment } from '../../../../modules.private/cli/dot-segment/dot-segment.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { refusalOf } from '../refusal/refusal.ts';

/** The dot segment's verdict at a store-addressed door — the transport's own words. */
export const DOT_STORE_REFUSAL =
  '"." and ".." refuse — an HTTP client normalizes the dot segment away, ' +
  'the URL (/stores/{name}) could never address the store: take a name it can carry';

export interface StoresCreateArgs {
  readonly name?: string;
}

export async function storesCreate(binding: Binding, args: StoresCreateArgs): Promise<AnswerOf> {
  if (missingArg(args.name)) {
    return refusalOf('the store name is missing — pass it as the command\u2019s first argument');
  }
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
  if (missingArg(args.name)) {
    return refusalOf('the store name is missing — pass it as the command\u2019s first argument');
  }
  if (isDotSegment(args.name)) return refusalOf(DOT_STORE_REFUSAL);
  const answer = await httpCall(binding, {
    method: 'get',
    path: `/stores/${encodeURIComponent(args.name)}`,
  });
  return answerOf(answer.status, answer.document);
}

export interface StoresForkArgs {
  readonly source?: string;
  readonly target?: string;
}

export async function storesFork(binding: Binding, args: StoresForkArgs): Promise<AnswerOf> {
  if (missingArg(args.source)) {
    return refusalOf(
      'the source is missing — pass the store to copy as the command\u2019s first argument',
    );
  }
  if (isDotSegment(args.source)) return refusalOf(DOT_STORE_REFUSAL);
  const answer = await httpCall(binding, {
    method: 'post',
    path: `/stores/${encodeURIComponent(args.source)}/fork`,
    body: missingArg(args.target) ? undefined : { name: args.target },
  });
  return answerOf(answer.status, answer.document);
}

export async function storesDelete(binding: Binding, args: StoresNameArgs): Promise<AnswerOf> {
  if (missingArg(args.name)) {
    return refusalOf('the store name is missing — pass it as the command\u2019s first argument');
  }
  if (isDotSegment(args.name)) return refusalOf(DOT_STORE_REFUSAL);
  const answer = await httpCall(binding, {
    method: 'delete',
    path: `/stores/${encodeURIComponent(args.name)}`,
  });
  // The gesture's echo (#49's ruling 10): the wire serves none — the
  // contract's one document per invocation names what the gesture did.
  if (answer.status === 204) {
    return { document: { name: args.name, deleted: true }, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
