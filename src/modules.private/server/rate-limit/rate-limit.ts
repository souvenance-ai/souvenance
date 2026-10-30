/**
 * The rate limit (Q4): a fixed 60 s window per grant, 120 requests, the
 * refusal a 429 carrying `Retry-After` in whole seconds. The constants
 * are code, not config — a grant owner tunes their pacing, not the
 * server's patience. Every credential eats the limit (#63) — the
 * operator's exemption retired with the loopback operator. Buckets key
 * on the credential's digest — two rows never share a bucket, the
 * secret never lands in one.
 */
import { createMiddleware } from 'hono/factory';
import type { ServerEnv } from '../auth/auth.ts';

export const RATE_LIMIT = 120;
export const RATE_WINDOW_MS = 60_000;

export interface RateLimitOptions {
  readonly limit?: number;
  readonly windowMs?: number;
  readonly now?: () => number;
}

interface Bucket {
  readonly windowStart: number;
  readonly count: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const limit = options.limit ?? RATE_LIMIT;
  const windowMs = options.windowMs ?? RATE_WINDOW_MS;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  return createMiddleware<ServerEnv>(async (c, next) => {
    const grant = c.get('grant');

    const windowStart = Math.floor(now() / windowMs) * windowMs;
    const bucket = buckets.get(grant.key);
    const count = (bucket?.windowStart === windowStart ? bucket.count : 0) + 1;
    buckets.set(grant.key, { windowStart, count });

    if (count > limit) {
      const retryAfterSeconds = Math.ceil((windowStart + windowMs - now()) / 1000);
      c.header('retry-after', String(Math.max(retryAfterSeconds, 1)));
      return c.json(
        { error: `rate limit exceeded — ${limit} requests per ${windowMs / 1000}s window` },
        429,
      );
    }
    return next();
  });
}
