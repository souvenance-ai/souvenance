/**
 * The auth middleware (#63): every request resolves to a credential or a
 * refusal. The wire speaks Bearer only — the loopback operator retired
 * (#63): no header, a malformed header, or a secret matching no row is a
 * 401, whatever the socket's peer; the peer is no longer read at all.
 *
 * Credentials come in two families (#63):
 *
 * - a store grant (`tokens[]`): one agent = one store, `ro` or `rw` —
 *   the data routes' only key;
 * - a management grant (`management[]`): the host's management surface —
 *   create, list, describe, fork, delete stores — and no store's data.
 *
 * The secret comparison is timing-safe the honest way: both sides are
 * hashed to fixed-length digests before timingSafeEqual — no length
 * leak, no early exit. The resolution walks both families; a secret
 * naming two rows was refused at config load.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { CredentialFamilies } from '../../config/config.ts';

export interface ServerEnv {
  Variables: {
    grant: ResolvedGrant;
  };
}

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

export type ResolvedGrant = StoreGrantResolved | ManagementGrantResolved;

/** The doors' shared narrowing: is this resolved grant the store family? */
export function isStoreGrant(grant: ResolvedGrant): grant is StoreGrantResolved {
  return grant.family === 'store';
}

export function bearerOf(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const [scheme, secret] = header.split(' ') as readonly string[];
  if (scheme === undefined || scheme.toLowerCase() !== 'bearer' || secret === undefined) {
    return undefined;
  }
  return secret;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function resolveBearer(credentials: CredentialFamilies, secret: string): ResolvedGrant | undefined {
  const presented = digest(secret);
  const store = credentials.tokens.find((grant) =>
    timingSafeEqual(digest(grant.secret), presented),
  );
  if (store !== undefined) {
    return {
      family: 'store',
      agent: store.agent,
      store: store.store,
      mode: store.mode,
      key: digest(store.secret).toString('hex').slice(0, 16),
    };
  }
  const row = credentials.management.find((grant) =>
    timingSafeEqual(digest(grant.secret), presented),
  );
  if (row !== undefined) {
    return {
      family: 'management',
      agent: row.agent,
      key: digest(row.secret).toString('hex').slice(0, 16),
    };
  }
  return undefined;
}

export function auth(credentials: CredentialFamilies) {
  return createMiddleware<ServerEnv>(async (c, next) => {
    const header = c.req.header('authorization');
    const secret = bearerOf(header);
    if (header !== undefined && secret === undefined) {
      // A presented credential must at least speak Bearer — a malformed
      // one is a refusal, never a guess.
      return c.json(
        { error: 'only Bearer credentials are spoken — pass Authorization: Bearer <secret>' },
        401,
      );
    }
    if (secret === undefined) {
      // No header, whatever the peer — every store access carries a token (#63).
      return c.json(
        { error: 'every store access carries a token — pass Authorization: Bearer <secret>' },
        401,
      );
    }
    const grant = resolveBearer(credentials, secret);
    if (grant === undefined) {
      return c.json({ error: 'unknown grant — the secret matches no token row' }, 401);
    }
    c.set('grant', grant);
    return next();
  });
}

/**
 * The management gate (#63): the management routes demand the management
 * family — a store grant refuses 403, whatever its mode. Bound per route
 * on the exact management paths, never as a blanket `/stores/*`
 * middleware: the data routes live deeper and serve store grants.
 */
export function requireManagement() {
  return createMiddleware<ServerEnv>(async (c, next) => {
    if (isStoreGrant(c.get('grant'))) {
      return c.json(
        {
          error:
            'a store grant reaches no management route — the management surface wants a management grant',
        },
        403,
      );
    }
    return next();
  });
}
