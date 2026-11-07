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
 * store-name grammar; the defaultHook formats), wrong family → 403
 * (mounted on the exact management paths in the assembly), unknown store
 * → 404, collisions → 409. The bodies are strict (#60): an unknown key
 * refuses 400 with the envelope teaching, never strips — the query rides
 * the same policy, NoQuerySchema refusing any param on the queryless
 * routes. One route group
 * per file; the slices keep landing as siblings (reads, writes) on the
 * same assembly.
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Registry } from '../registry/registry.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { CredentialDoors } from '../live-credentials/live-credentials.ts';
import {
  STORE_NAME_TEACHING,
  NoQuerySchema,
  credentialRefusalOutcome,
  payloadRefusal,
  refusal,
  StatsSchema,
  StoreNameSchema,
  unknownStoreRefusal,
} from '../wire/wire.ts';

const NameSchema = z.strictObject({ name: StoreNameSchema });
const ForkBodySchema = z.strictObject({
  name: StoreNameSchema.optional().describe(
    "the fork's name — composed from the source's name when absent; " + STORE_NAME_TEACHING,
  ),
});
const DescriptorSchema = z.object({ name: z.string(), stats: StatsSchema });

const CAP_REFUSAL = () => refusal('the grant carries no manage cap');
const UNKNOWN_REFUSAL = unknownStoreRefusal;
const COLLISION_REFUSAL = () => refusal('the store name is taken');
const GRAMMAR_REFUSAL = () => refusal('a name breaks the grammar');

export function registerManagementRoutes(
  app: OpenAPIHono<ServerEnv>,
  registry: Registry,
  doors: CredentialDoors,
): void {
  const createStore = createRoute({
    method: 'post',
    path: '/stores',
    summary: 'birth a store',
    description:
      "Creates an empty store — one individual's memory — under the body's name. " +
      "201 serves the name back. The management surface's gesture: a store grant never manages.",
    tags: ['stores'],
    request: {
      query: NoQuerySchema,
      body: { content: { 'application/json': { schema: NameSchema } }, required: true },
    },
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
    summary: 'list the stores',
    description:
      "Every open store as a descriptor: its name and its stats. The server's registry is " +
      "the inventory — the store's path never crosses the wire.",
    tags: ['stores'],
    request: { query: NoQuerySchema },
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
    summary: 'describe a store',
    description:
      "One store's descriptor: the name and its stats — the five-key ledger: population " +
      'by status and by kind, edges, edges by kind.',
    tags: ['stores'],
    request: {
      params: z.object({ name: StoreNameSchema }),
      query: NoQuerySchema,
    },
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
    summary: 'fork a store',
    description:
      'An exact copy of the store as a new store — a backup, or a state set aside to ' +
      'examine. Born unreached: no credential reaches the copy until one is minted for it. ' +
      "The body's name is optional — composed from the source's name when silent; 201 " +
      "serves the fork's name. The manager's gesture: forking never makes one individual two.",
    tags: ['stores'],
    request: {
      params: z.object({ name: StoreNameSchema }),
      query: NoQuerySchema,
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
    summary: 'delete a store',
    description:
      'The store, its memories and its edges are gone — irreversible. No confirmation ' +
      'parameter: reaching this route is the confirmation. Its grant rows leave with it: ' +
      'they author the same config file (and leave the live state in the same gesture), so ' +
      'no credential survives to name a store the next boot refuses to open.',
    tags: ['stores'],
    request: {
      params: z.object({ name: StoreNameSchema }),
      query: NoQuerySchema,
    },
    responses: {
      204: { description: 'gone — the store, its grants with it' },
      400: GRAMMAR_REFUSAL(),
      403: CAP_REFUSAL(),
      404: UNKNOWN_REFUSAL(),
      409: refusal('a drifted credential file needs the restart first'),
      500: refusal('the credential write refused — the config file is unreadable or unwritable'),
      413: payloadRefusal(),
    },
  });
  app.openapi(deleteStore, (c) => {
    const { name } = c.req.valid('param');
    const { live, configPath } = doors;
    // The rows that name the store are revoked first (#98): the file
    // write and the live-seat happen before the removal, so a wire
    // delete can never leave a credential authored on a store the next
    // boot refuses to open — the one state a full-remote operator could
    // no longer repair. The order also keeps every failure on this
    // route recoverable through the wire: if the removal fails after
    // the revocations landed, a mint can re-grant; the other order
    // (rows surviving the deletion) is the unrecoverable one.
    if (live.tokens.some((row) => row.store === name)) {
      const purged = {
        tokens: live.tokens.filter((row) => row.store !== name),
        management: live.management,
      };
      if (configPath === undefined) {
        // A programmatic boot owns its credentials in memory; no file
        // echo to author. The rows leave the live state with the store.
        live.assume(purged);
      } else {
        try {
          live.authorAndSeat(configPath, purged, 'the deletion');
        } catch (err) {
          const outcome = credentialRefusalOutcome(err, 'the deletion');
          return c.json(outcome, outcome.status);
        }
      }
    }
    registry.remove(name);
    return c.body(null, 204);
  });
}
