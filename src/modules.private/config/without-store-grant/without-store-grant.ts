/**
 * Take a store grant out of the credential families (#48's grant
 * family, #98's wire): the rows matching one (agent, store) pair are
 * gone — the count tells the caller what it removed, zero meaning the
 * pair held no grant (the caller serves its 404). One row lives per
 * pair (the mint refuses a second), so the count is 0 or 1; the
 * function stays plural anyway — revocation is the caller's door, the
 * array is its shape. Pure: the caller owns the file and the live
 * state; this only splices. The config module is the home both surfaces
 * share: the wire's revoke route and the manager CLI's
 * `grant store remove` (server down) speak this one revocation.
 */
import type { CredentialFamilies } from '../config.ts';

/** The revocation's target: which agent's grant on which store. */
export interface StoreGrantTarget {
  readonly agent: string;
  readonly store: string;
}

/** The splice's outcome: the next families, and the rows it removed. */
export interface RemovedStoreGrants {
  readonly next: CredentialFamilies;
  readonly count: number;
}

export function withoutStoreGrant(
  families: CredentialFamilies,
  target: StoreGrantTarget,
): RemovedStoreGrants {
  const tokens = families.tokens.filter(
    (row) => !(row.agent === target.agent && row.store === target.store),
  );
  return {
    // Explicit, never a spread: a CredentialFamilies may be a class
    // instance whose private fields a spread would silently drop.
    next: { tokens, management: families.management },
    count: families.tokens.length - tokens.length,
  };
}
