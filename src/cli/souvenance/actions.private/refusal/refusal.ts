/**
 * The client's own refusal — the local gates' verdict before any call:
 * one envelope on stdout, exit 1. The wire's refusals ride `answerOf`
 * verbatim; this one is the manager's own voice, spelled once.
 */
import type { AnswerOf } from '../../../../modules.private/cli/answer-of/answer-of.ts';

export function refusalOf(message: string): AnswerOf {
  return { document: { error: message }, exitCode: 1 };
}
