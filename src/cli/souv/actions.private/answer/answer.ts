/**
 * The one invocation's verdict (#17): exactly one JSON document on
 * stdout and one exit code — 0 served, 1 refused, 78 the binding's own
 * verdict (the client's config is the environment, ADR 0008's grammar).
 * The wire's answer is forwarded verbatim; the exit code is the client's
 * only judgment: a 2xx served, anything else refused.
 */
export interface SouvAnswer {
  readonly document: unknown;
  readonly exitCode: 0 | 1 | 78;
}

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
