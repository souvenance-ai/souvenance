/**
 * The client's own refusal — the local gates' verdict before any call:
 * one envelope on stdout, exit 1. The wire's refusals ride `answerOf`
 * verbatim; this is the local voice's one shape, shared by both bins
 * (the answer-of unit's mirror: one contract, one spelling).
 */
import type { AnswerOf } from '../answer-of/answer-of.ts';

export function refusalOf(message: string): AnswerOf {
  return { document: { error: message }, exitCode: 1 };
}
