/**
 * The store-management routes (slice 2, #19's management block): the
 * registry made HTTP, every route behind the manage cap — `POST /stores`
 * (201, 409 on collision), `GET /stores` (the descriptors, never the
 * paths — the v0.1 dbPath leak stays dead), `GET /stores/:name`
 * (`{name, stats}`), `POST /stores/:name/fork` (201 with the child's
 * name — composed when the body stays silent, Q15), `DELETE
 * /stores/:name` (204, hard — the cap is the confirmation, Q13).
 *
 * Refusals ride the envelope: grammar → 400 (the zod schemas carry the
 * store-name grammar; the defaultHook formats), foreign cap → 403
 * (mounted on the exact management paths in the assembly), unknown store
 * → 404, collisions → 409. The bodies are strict (#60): an unknown key
 * refuses 400 with the envelope teaching, never strips. One route group
 * per file; the slices keep landing as siblings (reads, writes) on the
 * same assembly.
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Registry } from '../registry/registry.ts';
import type { ServerEnv } from '../auth/auth.ts';
import {
  payloadRefusal,
  refusal,
  StatsSchema,
  StoreNameSchema,
  unknownStoreRefusal,
} from '../wire/wire.ts';

const NameSchema = z.strictObject({ name: StoreNameSchema });
const ForkBodySchema = z.strictObject({ name: StoreNameSchema.optional() });
const DescriptorSchema = z.object({ name: z.string(), stats: StatsSchema });

const CAP_REFUSAL = () => refusal('the grant carries no manage cap');
const UNKNOWN_REFUSAL = unknownStoreRefusal;
const COLLISION_REFUSAL = () => refusal('the store name is taken');
const GRAMMAR_REFUSAL = () => refusal('a name breaks the grammar');

export function registerManagementRoutes(app: OpenAPIHono<ServerEnv>, registry: Registry): void {
  const createStore = createRoute({
    method: 'post',
    path: '/stores',
    tags: ['stores'],
    request: { body: { content: { 'application/json': { schema: NameSchema } }, required: true } },
    responses: {
      201: {
        description: 'the store exists',
        content: { 'application/json': { schema: NameSchema } },
      },
      400: GRAMMAR_REFUSAL(),
      403: CAP_REFUSAL(),
      409: COLLISION_REFUSAL(),
      413: payloadRefusal(),
    },
  });
  app.openapi(createStore, (c) => {
    const { name } = c.req.valid('json');
    registry.create(name);
    return c.json({ name }, 201);
  });

  const listStores = createRoute({
    method: 'get',
    path: '/stores',
    tags: ['stores'],
    responses: {
      200: {
        description: 'every open store, by name with its stats',
        content: { 'application/json': { schema: z.array(DescriptorSchema).readonly() } },
      },
      403: CAP_REFUSAL(),
    },
  });
  app.openapi(listStores, (c) => {
    return c.json(registry.descriptors(), 200);
  });

  const describeStore = createRoute({
    method: 'get',
    path: '/stores/{name}',
    tags: ['stores'],
    request: { params: z.object({ name: StoreNameSchema }) },
    responses: {
      200: {
        description: 'the descriptor',
        content: { 'application/json': { schema: DescriptorSchema } },
      },
      400: GRAMMAR_REFUSAL(),
      403: CAP_REFUSAL(),
      404: UNKNOWN_REFUSAL(),
    },
  });
  app.openapi(describeStore, (c) => {
    const { name } = c.req.valid('param');
    const store = registry.get(name);
    if (store === undefined) {
      return c.json({ error: `no store "${name}" in the registry` }, 404);
    }
    return c.json({ name, stats: store.stats() }, 200);
  });

  const forkStore = createRoute({
    method: 'post',
    path: '/stores/{name}/fork',
    tags: ['stores'],
    request: {
      params: z.object({ name: StoreNameSchema }),
      body: { content: { 'application/json': { schema: ForkBodySchema } }, required: false },
    },
    responses: {
      201: {
        description: 'the fork exists — the forked name is the payload',
        content: { 'application/json': { schema: NameSchema } },
      },
      400: GRAMMAR_REFUSAL(),
      403: CAP_REFUSAL(),
      404: UNKNOWN_REFUSAL(),
      409: COLLISION_REFUSAL(),
      413: payloadRefusal(),
    },
  });
  app.openapi(forkStore, (c) => {
    const { name } = c.req.valid('param');
    const { name: forked } = c.req.valid('json') ?? {};
    const forkedName = registry.fork(name, forked);
    return c.json({ name: forkedName }, 201);
  });

  const deleteStore = createRoute({
    method: 'delete',
    path: '/stores/{name}',
    tags: ['stores'],
    request: { params: z.object({ name: StoreNameSchema }) },
    responses: {
      204: { description: 'gone — db, WAL sidecars and lock' },
      400: GRAMMAR_REFUSAL(),
      403: CAP_REFUSAL(),
      404: UNKNOWN_REFUSAL(),
      413: payloadRefusal(),
    },
  });
  app.openapi(deleteStore, (c) => {
    const { name } = c.req.valid('param');
    registry.remove(name);
    return c.body(null, 204);
  });
}
