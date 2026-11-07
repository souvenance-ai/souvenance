/**
 * The live credential state (#98, ADR 0009): the running server's own
 * copy of the two credential families. The boot builds it from the
 * resolved config; from then on the state, not the file, is what the
 * wire asks — the middleware resolves every request against it, and the
 * grant routes seat a new state in it on every minted or revoked row,
 * the file write and this swap happening in one synchronous gesture so
 * no request resolves against half an intent. One secret names at most
 * one row across both families at every instant — the boot invariant,
 * maintained at every swap by the mint's fresh-secret check and the
 * revocation's plain removals — never a duplicated resolution, never a
 * shared 429 bucket.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { CredentialFamilies, ManagementGrant, StoreGrant } from '../../config/config.ts';
import { authorCredentials } from '../../config/author-credentials/author-credentials.ts';

export type ResolvedGrant = StoreGrantResolved | ManagementGrantResolved;

export interface StoreGrantResolved {
  readonly family: 'store';
  readonly agent: string;
  readonly store: string;
  readonly mode: 'ro' | 'rw';
  /** The bucket identity for the rate limit — the secret's digest, never the secret. */
  readonly key: string;
}

export interface ManagementGrantResolved {
  readonly family: 'management';
  readonly agent: string;
  readonly key: string;
}

/** The doors' shared narrowing: is this resolved grant the store family? */
export function isStoreGrant(grant: ResolvedGrant): grant is StoreGrantResolved {
  return grant.family === 'store';
}

/**
 * The credential doors' wiring: the live state a route resolves against,
 * and the one config file that state re-authors on every gesture
 * (absent when the boot held no file — the mint and revoke teachings
 * refuse, the list serves the state alone).
 */
export interface CredentialDoors {
  readonly live: LiveCredentials;
  readonly configPath: string | undefined;
}

export class LiveCredentials implements CredentialFamilies {
  #tokens: readonly StoreGrant[];
  #management: readonly ManagementGrant[];

  private constructor(tokens: readonly StoreGrant[], management: readonly ManagementGrant[]) {
    this.#tokens = tokens;
    this.#management = management;
  }

  /** The boot's families, in hand: the live state starts there. */
  static from(families: CredentialFamilies): LiveCredentials {
    return new LiveCredentials([...families.tokens], [...families.management]);
  }

  get tokens(): readonly StoreGrant[] {
    return this.#tokens;
  }

  get management(): readonly ManagementGrant[] {
    return this.#management;
  }

  /**
   * The one read the middleware makes of the state per request: does
   * this presented secret name a row? The digest walk keeps the length
   * leak out of the comparison — both sides hashed before the
   * timing-safe byte.
   */
  resolve(secret: string): ResolvedGrant | undefined {
    const presented = digest(secret);
    const store = this.#tokens.find((row) => timingSafeEqual(digest(row.secret), presented));
    if (store !== undefined) {
      return {
        family: 'store',
        agent: store.agent,
        store: store.store,
        mode: store.mode,
        key: digestOf(store.secret),
      };
    }
    const row = this.#management.find((grant) => timingSafeEqual(digest(grant.secret), presented));
    if (row !== undefined) {
      return {
        family: 'management',
        agent: row.agent,
        key: digestOf(row.secret),
      };
    }
    return undefined;
  }

  /**
   * Seats the spliced state — called only after the config file was
   * authored to the same content, so the two sources of truth never
   * disagree in the happy path. Pure array swap: it cannot fail, which
   * is why the route stages nothing.
   */
  assume(next: CredentialFamilies): void {
    this.#tokens = next.tokens;
    this.#management = next.management;
  }

  /**
   * The credential doors' one gesture (#98): the file is authored from
   * this state's echo (this state is the `expected` the drift check
   * speaks of), and on success the drafted `next` is seated — file and
   * state move in one synchronous block, no request resolving against
   * half an intent. Every authoring route rides this, mint and revoke
   * and the deletion's sweep alike.
   */
  authorAndSeat(configPath: string, next: CredentialFamilies): void {
    authorCredentials(configPath, this, next);
    this.assume(next);
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function digestOf(value: string): string {
  return digest(value).toString('hex').slice(0, 16);
}
