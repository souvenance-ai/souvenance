/**
 * Mint a management grant into the credential families (#48's grant
 * family, #98's wire): one row per agent — a second mint on the same
 * agent refuses with the remedy taught (revoke first; rotating a
 * secret is revoke, then mint). The family has no store axis — its
 * pair collapses onto the agent alone (#48 ruling 5, P1's mirror, the
 * dev's 2026-11-08 answers). The secret is fresh from `mint` — the
 * pure check refuses one that names an existing row, so the live
 * invariant (one secret per row, both families pooled) holds at every
 * birth. Pure: no filesystem, no randomness of its own — the caller
 * injects the generator and the families in, the next families and
 * the minted row come out. The config module is the home both surfaces
 * share: the manager CLI's `grant management add` (server down) speaks
 * this one mint; the wire never mints this family (ADR 0009 re-supported
 * the host operator's ownership of who manages).
 */
import { ConfigError, type CredentialFamilies, type ManagementGrant } from '../config.ts';
import { mintSecret } from '../mint-secret/mint-secret.ts';

/** The request the mint judges: who, on the host's management surface. */
export interface ManagementGrantRequest {
  readonly agent: string;
}

/** The mint's product: the next families, and the row it minted. */
export interface MintedManagementGrant {
  readonly next: CredentialFamilies;
  readonly grant: ManagementGrant;
}

export function mintManagementGrant(
  families: CredentialFamilies,
  request: ManagementGrantRequest,
  mint: () => string = mintSecret,
): MintedManagementGrant {
  const held = families.management.find((row) => row.agent === request.agent);
  if (held !== undefined) {
    throw new ConfigError(
      `"${request.agent}" already holds a management grant — one row per agent; ` +
        `rotate the secret by revoking, then minting again`,
    );
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const grant: ManagementGrant = { agent: request.agent, secret: mint() };
    const fresh =
      families.tokens.every((row) => row.secret !== grant.secret) &&
      families.management.every((row) => row.secret !== grant.secret);
    if (fresh) {
      // Explicit, never a spread: a CredentialFamilies may be a class
      // instance whose private fields a spread would silently drop.
      return {
        next: {
          tokens: families.tokens,
          management: [...families.management, grant],
        },
        grant,
      };
    }
  }
  // Eight fresh secrets colliding with existing rows: the generator is
  // done guessing — each draw is a 2^-128 event; eight in a row is not
  // luck, it is a broken source. Refuse; the callers treat anything
  // beyond the pair refusal as their internal.
  throw new Error(
    'eight fresh grant secrets collided with existing rows in a row — the generator is broken',
  );
}
