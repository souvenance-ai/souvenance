/**
 * The HTTP server's skeleton (#20 slice 1): the public trio (/healthz,
 * /doc, /docs — shape disclosure only, Q7), the guarded /stores/*
 * namespace every slice's routes mount into, the refusal envelope
 * ({error: message}), and the caps. StoreError codes map to statuses
 * once, here — the honest mapping the typed refusals exist for (Q2);
 * a non-StoreError is an internal error whose internals go to the
 * operator's stderr, never to the client (#19: 500/503 do not disclose).
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import type { TokenGrant } from '../config/config.ts';
import { StoreError } from '../store/store-error/store-error.ts';
import { auth, type ServerEnv } from './auth/auth.ts';
import { rateLimit } from './rate-limit/rate-limit.ts';
import type { Registry } from './registry/registry.ts';

export const MAX_BODY_BYTES = 1024 * 1024;

/** The status a StoreError code maps to; read_only is the manager's case, never served. */
const STATUS_BY_CODE: Record<StoreError['code'], 400 | 404 | 409 | 503 | 500> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
  busy: 503,
  read_only: 500,
};

export interface ServerDeps {
  readonly registry: Registry;
  readonly tokens: readonly TokenGrant[];
  /** The package version the OpenAPI document carries. */
  readonly version?: string;
}

export function createApp(deps: ServerDeps): OpenAPIHono<ServerEnv> {
  const app = new OpenAPIHono<ServerEnv>();

  // The public trio — no data, only shape and liveness (Q7).
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.doc('/doc', {
    openapi: '3.0.0',
    info: { title: 'souvenance', version: deps.version ?? '0.2.0' },
  });
  app.get('/docs', swaggerUI({ url: '/doc' }));

  // The envelope: every refusal one JSON doc, {error: message} (#19).
  // 500 never carries details (#19): read_only (the manager's case — the
  // server never opens read-only) and every non-StoreError land in the
  // same opaque internal; the detail goes to the operator's stderr.
  const internal = (err: unknown, c: Context): Response => {
    process.stderr.write(`internal error: ${err instanceof Error ? err.stack : String(err)}\n`);
    return c.json({ error: 'internal error' }, 500);
  };
  app.onError((err, c) => {
    if (!(err instanceof StoreError)) return internal(err, c);
    const status = STATUS_BY_CODE[err.code];
    if (status === 500) return internal(err, c);
    return c.json({ error: err.message }, status);
  });
  app.notFound((c) => c.json({ error: 'no such route' }, 404));

  // The guarded namespace: the whole API lives under /stores/* (#19 Mount).
  // Auth first, then the rate limit (it reads the grant), then the cap.
  app.use('/stores/*', auth(deps.tokens));
  app.use('/stores/*', rateLimit());
  app.use(
    '/stores/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: `body exceeds ${MAX_BODY_BYTES} bytes` }, 413),
    }),
  );

  return app;
}
