/**
 * The JSON flags' local gate: the client judges only that the flag
 * parses — the slice plan's fail-fast gate — and the parsed value rides
 * verbatim; the grammar is the wire's. One verdict family with the
 * addressed id's: absent (the flag was not passed), ride (the parsed
 * value), refuse (the envelope's voice).
 */
import type { SouvAnswer } from '../answer/answer.ts';
import { refusalOf } from '../refusal/refusal.ts';

export type JsonFlagVerdict =
  | { readonly state: 'absent' }
  | { readonly state: 'ride'; readonly parsed: unknown }
  | { readonly state: 'refuse'; readonly refusal: SouvAnswer };

export function jsonFlag(flag: string, raw: string | undefined): JsonFlagVerdict {
  if (raw === undefined) return { state: 'absent' };
  try {
    return { state: 'ride', parsed: JSON.parse(raw) };
  } catch {
    return {
      state: 'refuse',
      refusal: refusalOf(`${flag} must be one JSON document — this does not parse`),
    };
  }
}
