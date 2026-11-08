/**
 * The composed fork name (the fork's birth rule, shared by the wire and
 * the manager): `<source>-fork`, then `-fork-2`, … — the first candidate
 * free of collisions wins. The suffix is bounded so the composition
 * never breaks the 32-char grammar: a long source truncates before the
 * suffix lands. One rule, two collision sets: the registry passes its
 * open map (the wire's fork), the manager passes its dir scan (the
 * offline fork) — each caller binds its own `occupied` predicate below.
 */
import { STORE_NAME } from '../../../config/config.ts';
import { StoreError } from '../../store-error/store-error.ts';

/** The composition's patience: one hundred candidates is a registry gone mad. */
const COMPOSITION_BOUND = 100;

export function composeForkName(source: string, occupied: (candidate: string) => boolean): string {
  for (let attempt = 1; attempt < COMPOSITION_BOUND; attempt++) {
    const suffix = attempt === 1 ? '-fork' : `-fork-${attempt}`;
    const candidate = `${source.slice(0, 32 - suffix.length)}${suffix}`;
    if (STORE_NAME.test(candidate) && !occupied(candidate)) return candidate;
  }
  throw new StoreError('conflict', `no free fork name for "${source}"`);
}
