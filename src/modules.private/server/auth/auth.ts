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
 * (@hono/node-server env) and the check fails closed: no socket info is
 * not loopback — it is unverifiable, and unverifiable callers refuse.
 * The socket-less tests inject a loopback peer explicitly (app.request's
 * env parameter); the remote refusal is pinned on that same path.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
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

/** Whether the grant may serve this store: the operator reaches every store, a grant its one. */
export function grantReaches(grant: ResolvedGrant, storeName: string): boolean {
  return grant.store === OPERATOR_STORE || grant.store === storeName;
}

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
    const header = c.req.header('authorization');
    const secret = bearerOf(header);
    if (header !== undefined && secret === undefined) {
      // A presented credential must at least speak Bearer — a malformed
      // one is a refusal, never a silent downgrade to the operator.
      return c.json(
        { error: 'only Bearer credentials are spoken — pass Authorization: Bearer <secret>' },
        401,
      );
    }
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
    // Fail closed: a peer we cannot see is a peer we cannot vouch for —
    // the operator grant is never handed to an unverifiable caller. The
    // node adapter always provides the socket; its absence refuses.
    const peer = peerAddress(c);
    if (peer === undefined || !isLoopback(peer)) {
      return c.json(
        { error: 'tokens required — no loopback peer seen; pass Authorization: Bearer <secret>' },
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

/**
 * The manage-cap gate (slice 2): the management routes demand the cap
 * explicitly — default-deny means a grant without `manage` refuses 403
 * (Q8), the operator passes. Bound per route, never as a blanket
 * `/stores/*` middleware: the data routes must stay open to plain rw
 * grants.
 */
export function requireManage() {
  return createMiddleware<ServerEnv>(async (c, next) => {
    if (c.get('grant').manage !== true) {
      return c.json({ error: 'the manage cap is required — this grant does not carry it' }, 403);
    }
    return next();
  });
}

/**
 * The write-mode gate (slice 4, Q8): a ro grant reads everything it
 * reaches and writes nothing — every write handler calls this first
 * (after the reach gate: reach, then mode). Inline per handler, never a
 * blanket middleware: the write paths share their prefixes with reads.
 */
export function assertWritable(grant: ResolvedGrant): void {
  if (grant.mode !== 'rw') {
    throw new HTTPException(403, {
      message: 'this grant is read-only — writes need a grant with mode rw',
    });
  }
}
