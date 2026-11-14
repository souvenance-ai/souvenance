/**
 * The wire's verdict as the CLI's answer — one mapping, both bins
 * (#17's one contract): the document verbatim, the exit from the
 * status. A 2xx served, anything else refused; a wire answer with no
 * document is a refusal — the client serves its own envelope rather
 * than an empty stdout, the contract's one document per invocation.
 * The verdict is the client's only judgment: the wire's refusals ride
 * verbatim, the shape is never judged twice.
 */
export interface AnswerOf {
  readonly document: unknown;
  readonly exitCode: 0 | 1 | 78;
}

export function answerOf(status: number, document?: unknown): AnswerOf {
  if (document === undefined) {
    return {
      document: { error: `the server answered ${status} without its document` },
      exitCode: 1,
    };
  }
  return { document, exitCode: status >= 200 && status < 300 ? 0 : 1 };
}
