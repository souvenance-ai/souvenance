/**
 * Mint a store grant into the credential families (#48's grant family,
 * #98's wire): one row per (agent, store) pair — a second mint on the
 * same pair refuses with the remedy taught (revoke first; rotating a
 * secret or changing a mode is revoke, then mint). The secret is fresh
 * from `mint` — the pure check refuses one that names an existing row,
 * so the live invariant (one secret per row, both families pooled) holds
 * at every birth. Pure: no filesystem, no randomness of its own — the
 * caller injects the generator and the families in, the next families
 * and the minted row come out. The config module is the home both
 * surfaces share: the wire's mint route and the manager CLI's
 * `grant store add` (server down) speak this one mint.
 */
import { ConfigError, type CredentialFamilies, type StoreGrant } from '../config.ts';
import { mintSecret } from '../mint-secret/mint-secret.ts';

/** The request the mint judges: who, on which store, with which mode. */
export interface StoreGrantRequest {
  readonly agent: string;
  readonly store: string;
  readonly mode: 'ro' | 'rw';
}

/** The mint's product: the next families, and the row it minted. */
export interface MintedStoreGrant {
  readonly next: CredentialFamilies;
  readonly grant: StoreGrant;
}

export function mintStoreGrant(
  families: CredentialFamilies,
  request: StoreGrantRequest,
  mint: () => string = mintSecret,
): MintedStoreGrant {
  const held = families.tokens.find(
    (row) => row.agent === request.agent && row.store === request.store,
  );
  if (held !== undefined) {
    throw new ConfigError(
      `"${request.agent}" already holds a grant on "${request.store}" — one row per agent ` +
        `and store; rotate the secret or change the mode by revoking, then minting again`,
    );
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const grant: StoreGrant = {
      agent: request.agent,
      secret: mint(),
      store: request.store,
      mode: request.mode,
    };
    const fresh =
      families.tokens.every((row) => row.secret !== grant.secret) &&
      families.management.every((row) => row.secret !== grant.secret);
    if (fresh) {
      // Explicit, never a spread: a CredentialFamilies may be a class
      // instance whose private fields a spread would silently drop.
      return {
        next: {
          tokens: [...families.tokens, grant],
          management: families.management,
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
