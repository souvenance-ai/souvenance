/**
 * The ritual routes (slice 3): the session's two gestures over one store
 * — `GET /checkin` serves the hot block and the stats in one call (the
 * entry), `GET /checkout` serves the consolidation verdict (the exit).
 * Both are reads over the facade's reports, served verbatim; both open
 * to ro grants — reading the register is not writing it.
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { MAX_LIMIT } from '../limits/limits.ts';
import { reachedStore } from '../reached-store/reached-store.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';
import { CheckinReportSchema, CheckoutReportSchema } from '../wire/wire.ts';
import { STORE_NAME } from '../../config/config.ts';

const ErrorSchema = z.object({ error: z.string() });
const StoreNameSchema = z.string().regex(STORE_NAME);
const StoreParamsSchema = z.object({ name: StoreNameSchema });

export function registerRitualRoutes(app: OpenAPIHono<ServerEnv>, registry: Registry): void {
  const checkin = createRoute({
    method: 'get',
    path: '/stores/{name}/checkin',
    tags: ['rituals'],
    request: {
      params: StoreParamsSchema,
      query: z.object({ limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional() }),
    },
    responses: {
      200: {
        description: 'the hot block (newest first) and the store stats — the session opens here',
        content: { 'application/json': { schema: CheckinReportSchema } },
      },
      400: {
        description: 'the limit is not ours',
        content: { 'application/json': { schema: ErrorSchema } },
      },
      403: {
        description: 'the grant reaches another store',
        content: { 'application/json': { schema: ErrorSchema } },
      },
      404: {
        description: 'no such store',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
  });
  app.openapi(checkin, (c) => {
    const { name } = c.req.valid('param');
    const store = reachedStore(c, registry, name);
    const { limit } = c.req.valid('query');
    return c.json(store.checkin({ limit }), 200);
  });

  const checkout = createRoute({
    method: 'get',
    path: '/stores/{name}/checkout',
    tags: ['rituals'],
    request: { params: StoreParamsSchema },
    responses: {
      200: {
        description: 'the consolidation verdict — healthy or the payable findings',
        content: { 'application/json': { schema: CheckoutReportSchema } },
      },
      403: {
        description: 'the grant reaches another store',
        content: { 'application/json': { schema: ErrorSchema } },
      },
      404: {
        description: 'no such store',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
  });
  app.openapi(checkout, (c) => {
    const { name } = c.req.valid('param');
    const store = reachedStore(c, registry, name);
    return c.json(store.checkout(), 200);
  });
}
