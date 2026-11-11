/**
 * The client's own refusal — the local gates' verdict before any call:
 * one envelope on stdout, exit 1. The wire's refusals ride `answerOf`
 * verbatim; this one is the CLI's own voice, spelled once.
 */
import type { SouvAnswer } from '../answer/answer.ts';

export function refusalOf(message: string): SouvAnswer {
  return { document: { error: message }, exitCode: 1 };
}
