/**
 * The one invocation's verdict (#17): exactly one JSON document on
 * stdout and one exit code — 0 served, 1 refused, 78 the binding's own
 * verdict (the client's config is the environment, ADR 0008's grammar).
 * The wire's answer is forwarded verbatim; the exit code is the client's
 * only judgment: a 2xx served, anything else refused. The text doors'
 * body rides the same verdict — the wire's declared markdown served
 * verbatim (the skills' SKILL.md: an installation is a copy, never a
 * transform, #77), the help's and the version's precedent extended.
 * The absent side is `undefined`-typed, so the impossible state (both
 * documents riding) does not type.
 */
export interface SouvDocumentAnswer {
  readonly document: unknown;
  readonly text?: undefined;
  readonly exitCode: 0 | 1 | 78;
}

export interface SouvTextAnswer {
  readonly document?: undefined;
  readonly text: string;
  readonly exitCode: 0 | 1 | 78;
}

export type SouvAnswer = SouvDocumentAnswer | SouvTextAnswer;

/**
 * The wire's verdict as the CLI's answer: the document verbatim, the
 * exit from the status. A wire answer with no document is a refusal —
 * the client serves its own envelope rather than an empty stdout, the
 * contract's one document per invocation.
 */
export function answerOf(status: number, document?: unknown): SouvAnswer {
  if (document === undefined) {
    return {
      document: { error: `the server answered ${status} without its document` },
      exitCode: 1,
    };
  }
  return { document, exitCode: status >= 200 && status < 300 ? 0 : 1 };
}
