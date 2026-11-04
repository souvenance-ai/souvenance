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
import type { Skills } from '../skills/skills.ts';
import {
  ServedCheckinReportSchema,
  CheckoutReportSchema,
  CHECKOUT_DEBTS_TEACHING,
  checkinLimitShape,
  refusal,
  unknownStoreRefusal,
} from '../wire/wire.ts';

export function registerRitualRoutes(
  app: OpenAPIHono<ServerEnv>,
  registry: Registry,
  skills: Skills,
): void {
  const checkin = createRoute({
    method: 'get',
    path: '/checkin',
    summary: 'open a session',
    description:
      "The session-start ritual: the hot memories with their relations, the store's " +
      'stats, the waking guidance — one call, newest first. Reading the register is not ' +
      'writing it: read-only grants open here.',
    tags: ['rituals'],
    request: {
      query: z.object({ limit: checkinLimitShape }),
    },
    responses: {
      200: {
        description:
          'the hot block (newest first) and the store stats — the session opens here, ' +
          'the waking voice beside the data',
        content: { 'application/json': { schema: ServedCheckinReportSchema } },
      },
      400: refusal('the limit is not ours'),
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(checkin, (c) => {
    const store = reachedStore(c, registry);
    const { limit } = c.req.valid('query');
    const report = store.checkin({ limit });
    // The wire's voice (#82): the served set rides the checkin — the
    // continuity line on a living store, the unborn line overriding on
    // an empty one. The code decides whether; the files decided what.
    const guidance = skills.guidanceFor('checkin', { storeEmpty: report.stats.memories === 0 });
    return c.json(guidance === undefined ? report : { ...report, guidance }, 200);
  });

  const checkout = createRoute({
    method: 'get',
    path: '/checkout',
    summary: 'close a session',
    description:
      'The session-end verdict: the store reports its consolidation debts — ' +
      CHECKOUT_DEBTS_TEACHING +
      ' — each payable with the write verbs; healthy lands true only when every debt ' +
      'is paid. ' +
      "Corruption is not the gate's business — the operator's doctor audits it.",
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
