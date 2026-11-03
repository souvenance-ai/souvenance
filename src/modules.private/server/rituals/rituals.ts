/**
 * The ritual routes (slice 3): the session's two gestures over one store
 * — `GET /checkin` serves the hot block and the stats in one call (the
 * entry), `GET /checkout` serves the consolidation verdict (the exit).
 * Both are reads over the facade's reports, served verbatim; both open
 * to ro grants — reading the register is not writing it.
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { reachedStore } from '../reached-store/reached-store.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';
import {
  CheckinReportSchema,
  CheckoutReportSchema,
  checkinLimitShape,
  refusal,
  unknownStoreRefusal,
} from '../wire/wire.ts';

export function registerRitualRoutes(app: OpenAPIHono<ServerEnv>, registry: Registry): void {
  const checkin = createRoute({
    method: 'get',
    path: '/checkin',
    tags: ['rituals'],
    request: {
      query: z.object({ limit: checkinLimitShape }),
    },
    responses: {
      200: {
        description: 'the hot block (newest first) and the store stats — the session opens here',
        content: { 'application/json': { schema: CheckinReportSchema } },
      },
      400: refusal('the limit is not ours'),
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(checkin, (c) => {
    const store = reachedStore(c, registry);
    const { limit } = c.req.valid('query');
    return c.json(store.checkin({ limit }), 200);
  });

  const checkout = createRoute({
    method: 'get',
    path: '/checkout',
    tags: ['rituals'],
    responses: {
      200: {
        description: 'the consolidation verdict — healthy or the payable findings',
        content: { 'application/json': { schema: CheckoutReportSchema } },
      },
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(checkout, (c) => {
    const store = reachedStore(c, registry);
    return c.json(store.checkout(), 200);
  });
}
