/**
 * The auth middleware (#19, Q8): every request resolves to a grant or a
 * refusal. Three paths:
 *
 * - a `Authorization: Bearer souv-…` header matching one token row: that
 *   grant (1 grant = 1 agent = 1 store);
 * - no header on a loopback peer: the operator — rw + manage, every
 *   store (loopback-without-tokens is operator mode, #19);
 * - no header off loopback, or a header matching no row: 401.
 *
 * The secret comparison is timing-safe the honest way: both sides are
 * hashed to fixed-length digests before timingSafeEqual — no length
 * leak, no early exit. The peer is read off the node socket
 * (@hono/node-server env); no socket info (unit tests' synthetic
 * requests) counts as loopback — the tests exercise operator mode by
 * default and pin the remote refusal on the header path.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { TokenGrant } from '../../config/config.ts';

export interface ServerEnv {
  Variables: {
    grant: ResolvedGrant;
  };
}

export interface ResolvedGrant {
  readonly agent: string;
  /** The grant's one store, or OPERATOR_STORE for the operator. */
  readonly store: string;
  readonly mode: 'ro' | 'rw';
  readonly manage: boolean;
  /** The operator (loopback, no tokens) — exempt from the rate limit (Q10). */
  readonly operator: boolean;
  /** The bucket identity for the rate limit — the secret's digest, never the secret. */
  readonly key: string;
}

export const OPERATOR_STORE = '*';

export function isLoopback(peer: string): boolean {
  return peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
}

/** The boot-time shape of the same notion: which host bindings are local. */
export function isLoopbackHost(host: string): boolean {
  return isLoopback(host) || host === 'localhost';
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

function peerAddress(c: { env: unknown }): string | undefined {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress;
}

function resolveToken(tokens: readonly TokenGrant[], secret: string): TokenGrant | undefined {
  const presented = digest(secret);
  return tokens.find((grant) => timingSafeEqual(digest(grant.secret), presented));
}

export function auth(tokens: readonly TokenGrant[]) {
  return createMiddleware<ServerEnv>(async (c, next) => {
    const secret = bearerOf(c.req.header('authorization'));
    if (secret !== undefined) {
      const grant = resolveToken(tokens, secret);
      if (grant === undefined) {
        return c.json({ error: 'unknown grant — the secret matches no token row' }, 401);
      }
      c.set('grant', {
        agent: grant.agent,
        store: grant.store,
        mode: grant.mode,
        manage: grant.manage ?? false,
        operator: false,
        key: digest(grant.secret).toString('hex').slice(0, 16),
      });
      return next();
    }
    const peer = peerAddress(c);
    if (peer !== undefined && !isLoopback(peer)) {
      return c.json(
        { error: 'tokens required off loopback — pass Authorization: Bearer <secret>' },
        401,
      );
    }
    c.set('grant', {
      agent: 'operator',
      store: OPERATOR_STORE,
      mode: 'rw',
      manage: true,
      operator: true,
      key: 'operator',
    });
    return next();
  });
}
