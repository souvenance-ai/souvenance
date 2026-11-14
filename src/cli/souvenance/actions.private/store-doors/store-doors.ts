/**
 * The stores family's one door voice (the mint-doors pattern): every
 * phrase the family's gates speak on refusal, declared once — the five
 * stores verbs and the grants trio cannot drift apart. The segment
 * gate is the URL-addressed doors' own: the name is demanded (the
 * missing door) and a dot segment is not a store name — the URL parser
 * folds /<dot> into the parent route, the wire's verdict would never be
 * asked (the shared judge). The verdict carries the narrowed name when
 * it may ride (the memory-id precedent). The bodies (create's name, the
 * mint's agent and mode) ride to the wire unjudged — the wire's grammar
 * teaches.
 */
import type { AnswerOf } from '../../../../modules.private/cli/answer-of/answer-of.ts';
import { isDotSegment } from '../../../../modules.private/cli/dot-segment/dot-segment.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import { refusalOf } from '../../../../modules.private/cli/refusal-of/refusal-of.ts';

/** The dot segment's verdict at a store-addressed door — the transport's own words. */
export const DOT_STORE_REFUSAL =
  '"." and ".." refuse — an HTTP client normalizes the dot segment away, ' +
  'the URL (/stores/{name}) could never address the store: take a name it can carry';

/** The missing name's verdict, one voice for the family. */
export const STORE_NAME_MISSING =
  'the store name is missing — pass it as the command\u2019s first argument';

export type StoreNameVerdict =
  | { readonly state: 'ride'; readonly name: string }
  | { readonly state: 'refuse'; readonly refusal: AnswerOf };

/** The segment-addressed store gate: the name's verdict, spoken once for the family. */
export function storeNameGate(name: string | undefined): StoreNameVerdict {
  if (missingArg(name)) {
    return { state: 'refuse', refusal: refusalOf(STORE_NAME_MISSING) };
  }
  if (isDotSegment(name)) {
    return { state: 'refuse', refusal: refusalOf(DOT_STORE_REFUSAL) };
  }
  return { state: 'ride', name };
}
