/**
 * The JSON flags' local gate: the client judges only that the flag
 * parses — the slice plan's fail-fast gate — and the parsed value rides
 * verbatim; the grammar is the wire's. One spelling, every JSON flag.
 */
import type { SouvAnswer } from '../answer/answer.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface JsonFlag {
  readonly parsed?: unknown;
  readonly refusal?: SouvAnswer;
}

export function jsonFlag(flag: string, raw: string | undefined): JsonFlag {
  if (raw === undefined) return {};
  try {
    return { parsed: JSON.parse(raw) };
  } catch {
    return { refusal: refusalOf(`${flag} must be one JSON document — this does not parse`) };
  }
}
