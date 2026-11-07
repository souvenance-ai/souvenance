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
 * The resolution walks the LIVE credential state (#98, ADR 0009) — the
 * state the routes seat on every minted or revoked row, so a wire grant
 * is effective the moment its secret is served.
 */
import { createMiddleware } from 'hono/factory';
import type { ResolvedGrant } from '../live-credentials/live-credentials.ts';
import { isStoreGrant, type LiveCredentials } from '../live-credentials/live-credentials.ts';

export interface ServerEnv {
  Variables: {
    grant: ResolvedGrant;
  };
}

export function bearerOf(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const [scheme, secret] = header.split(' ') as readonly string[];
  if (scheme === undefined || scheme.toLowerCase() !== 'bearer' || secret === undefined) {
    return undefined;
  }
  return secret;
}

export function auth(credentials: LiveCredentials) {
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
    const grant = credentials.resolve(secret);
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
 * middleware: the data routes live at the root (#74) and serve store
 * grants.
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
