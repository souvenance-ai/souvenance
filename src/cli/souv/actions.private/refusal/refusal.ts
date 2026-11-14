/**
 * The client's own refusal — the local gates' verdict before any call:
 * one envelope on stdout, exit 1. The mapping is the shared refusal-of
 * unit — one envelope shape, both bins (the answer-of unit's mirror) —
 * returned as this bin's own answer type.
 */
import { refusalOf as refusalOfWire } from '../../../../modules.private/cli/refusal-of/refusal-of.ts';
import type { SouvAnswer } from '../answer/answer.ts';

export function refusalOf(message: string): SouvAnswer {
  return refusalOfWire(message);
}
