/**
 * Take a management grant out of the credential families (#48's grant
 * family): the rows matching one agent are gone — the count tells the
 * caller what it removed, zero meaning the agent held no management
 * row (the caller serves its not-found). One row lives per agent (the
 * mint refuses a second), so the count is 0 or 1; the function stays
 * plural anyway — revocation is the caller's door, the array is its
 * shape. Pure: the caller owns the file; this only splices. The config
 * module is the shared home: the manager CLI's `grant management
 * remove` speaks this one revocation; the wire never revokes this
 * family (ADR 0009 keeps who-manages with the host operator).
 */
import type { CredentialFamilies } from '../config.ts';

/** The revocation's target: which agent's management row. */
export interface ManagementGrantTarget {
  readonly agent: string;
}

/** The splice's outcome: the next families, and the rows it removed. */
export interface RemovedManagementGrants {
  readonly next: CredentialFamilies;
  readonly count: number;
}

export function withoutManagementGrant(
  families: CredentialFamilies,
  target: ManagementGrantTarget,
): RemovedManagementGrants {
  const management = families.management.filter((row) => row.agent !== target.agent);
  return {
    // Explicit, never a spread: a CredentialFamilies may be a class
    // instance whose private fields a spread would silently drop.
    next: { tokens: families.tokens, management },
    count: families.management.length - management.length,
  };
}
