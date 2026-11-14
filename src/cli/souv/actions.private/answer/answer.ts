/**
 * The one invocation's verdict (#17): exactly one JSON document on
 * stdout and one exit code — 0 served, 1 refused, 78 the binding's own
 * verdict (the client's config is the environment, ADR 0008's grammar).
 * The wire's answer is forwarded verbatim; the exit code is the client's
 * only judgment: a 2xx served, anything else refused. The mapping is the
 * shared `answer-of` unit — one verdict shape, both bins. The text doors'
 * body rides the same verdict — the wire's declared markdown served
 * verbatim (the skills' SKILL.md: an installation is a copy, never a
 * transform, #77), the help's and the version's precedent extended.
 * The absent side is `undefined`-typed, so the impossible state (both
 * documents riding) does not type.
 */
import { answerOf as answerOfWire } from '../../../../modules.private/cli/answer-of/answer-of.ts';

interface SouvDocumentAnswer {
  readonly document: unknown;
  readonly text?: undefined;
  readonly exitCode: 0 | 1 | 78;
}

interface SouvTextAnswer {
  readonly document?: undefined;
  readonly text: string;
  readonly exitCode: 0 | 1 | 78;
}

export type SouvAnswer = SouvDocumentAnswer | SouvTextAnswer;

/**
 * The wire's verdict as the CLI's answer: the shared mapping, returned
 * as this bin's own answer type.
 */
export function answerOf(status: number, document?: unknown): SouvAnswer {
  return answerOfWire(status, document);
}
