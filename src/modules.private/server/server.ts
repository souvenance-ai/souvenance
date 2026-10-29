/**
 * The HTTP server's skeleton (#20 slice 1): the public trio (/healthz,
 * /doc, /docs — shape disclosure only, Q7), the guarded /stores/*
 * namespace every slice's routes mount into, the refusal envelope
 * ({error: message}), and the caps. StoreError codes map to statuses
 * once, here — the honest mapping the typed refusals exist for (Q2);
 * a non-StoreError is an internal error and busy is an opaque 503, both
 * keeping their internals on the operator's stderr, never on the wire
 * (#19: 500/503 do not disclose).
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import type { TokenGrant } from '../config/config.ts';
import { StoreError } from '../store/store-error/store-error.ts';
import { auth, requireManage, type ServerEnv } from './auth/auth.ts';
import { rateLimit } from './rate-limit/rate-limit.ts';
import { registerManagementRoutes } from './management/management.ts';
import { registerReadRoutes } from './reads/reads.ts';
import { registerRitualRoutes } from './rituals/rituals.ts';
import { registerWriteRoutes } from './writes/writes.ts';
import type { Registry } from './registry/registry.ts';
import { HTTPException } from 'hono/http-exception';
import {
  CheckinReportSchema,
  CheckoutReportSchema,
  MemoryNodeSchema,
  OutEdgeSchema,
  SearchHitSchema,
} from './wire/wire.ts';

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
  const app = new OpenAPIHono<ServerEnv>({
    // One schema set validates AND documents (ADR 0005) — and one error
    // shape: a zod refusal is formatted into the {error} envelope, never
    // zod's own success/error split.
    defaultHook: (result, c) => {
      if (!result.success) {
        const issues = result.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        return c.json({ error: `invalid request — ${issues}` }, 400);
      }
      return;
    },
  });

  // The public trio — no data, only shape and liveness (Q7).
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.doc('/doc', {
    openapi: '3.0.0',
    info: { title: 'souvenance', version: deps.version ?? '0.2.0' },
  });
  app.get('/docs', swaggerUI({ url: '/doc' }));

  // The recursive wire shapes must be NAMED components: the OpenAPI
  // generator inlines every schema it walks, and a recursion inlined is
  // an infinite walk — registered, the cycle emits $ref instead.
  for (const [name, schema] of [
    ['MemoryNode', MemoryNodeSchema],
    ['OutEdge', OutEdgeSchema],
    ['SearchHit', SearchHitSchema],
    ['CheckinReport', CheckinReportSchema],
    ['CheckoutReport', CheckoutReportSchema],
  ] as const) {
    app.openAPIRegistry.register(name, schema);
  }

  // The envelope: every refusal one JSON doc, {error: message} (#19).
  // 503/500 never carry details (#19): busy reaches the client as its own
  // teaching (retry in a moment), while read_only (the manager's case —
  // the server never opens read-only) and every non-StoreError land in
  // the same opaque internal; the detail goes to the operator's stderr.
  const internal = (err: unknown, c: Context): Response => {
    process.stderr.write(`internal error: ${err instanceof Error ? err.stack : String(err)}\n`);
    return c.json({ error: 'internal error' }, 500);
  };
  app.onError((err, c) => {
    // Hono's own HTTP exceptions — the data routes' reach refusals — ride
    // the envelope with their status.
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status as 400 | 403 | 404);
    }
    if (!(err instanceof StoreError)) return internal(err, c);
    const status = STATUS_BY_CODE[err.code];
    // busy is neither the client's mistake nor an internal: the store is
    // alive and the request was honest — the refused answer is opaque all
    // the same (#19: 500/503 do not disclose), the engine's raw message
    // (SQLITE_BUSY's own text) goes to the operator's stderr only.
    if (status === 503) {
      process.stderr.write(`store busy: ${err.message}\n`);
      return c.json({ error: 'the store is busy — retry in a moment' }, 503);
    }
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

  // The management gate: the exact management paths only — the data
  // routes (slices 3–4) live deeper under /stores/:name/… and must stay
  // open to plain rw grants.
  app.use('/stores', requireManage());
  app.use('/stores/:name', requireManage());
  app.use('/stores/:name/fork', requireManage());

  registerManagementRoutes(app, deps.registry);
  registerReadRoutes(app, deps.registry);
  registerRitualRoutes(app, deps.registry);
  registerWriteRoutes(app, deps.registry);

  return app;
}
