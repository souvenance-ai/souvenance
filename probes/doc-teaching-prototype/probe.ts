/**
 * PROTOTYPE — throwaway, never shipped (ticket #90: "One family's texts
 * read right"). Rebuilds the stores + rituals routes with the DRAFTED
 * teaching texts (operation summary/description, schema .describe()) and
 * dumps the folded /doc, so the owner reacts to the served shape and the
 * voice, not a sketch. Run: node probes/doc-teaching-prototype/probe.ts
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

// ——— The drafted texts, exactly as proposed on #90.

const infoDescription =
  'Persistent, searchable memory for AI agents: typed graphs of memories in ' +
  'stores, served over HTTP.\n\n' +
  'One store is one individual\'s memory. The grant is the address: a store ' +
  'grant (Bearer) pins one store, read or read-write, and the data routes — ' +
  '/memories, /search, /checkin, /checkout — carry no store name. The ' +
  'management surface under /stores names stores; only a management grant ' +
  'reaches it, a store grant never touches it.\n\n' +
  'Every refusal is one JSON doc, {error: message}, and the message teaches: ' +
  'the wire carries its grammar in the refusals. The waking posture is ' +
  'served, not stored — GET /skills and its start skill teach how to wake, ' +
  'session, and consolidate; this document teaches the wire itself.';

const storeNameTeaching =
  'lowercase, starts with a letter, up to 32 characters (a-z, 0-9, dashes)';

const StoreNameSchema = z.string().describe(storeNameTeaching);
const NameBodySchema = z.strictObject({ name: StoreNameSchema });
const ForkBodySchema = z
  .strictObject({
    name: StoreNameSchema.describe(
      'the fork\'s name — composed from the source\'s name when absent',
    ),
  })
  .optional();

const storesNameParam = z
  .string()
  .describe(storeNameTeaching)
  .openapi({ param: { name: 'name', in: 'path' }, description: storeNameTeaching });

// ——— The stores family (management), with the drafted texts.

const createStore = createRoute({
  method: 'post',
  path: '/stores',
  summary: 'birth a store',
  description:
    'Creates an empty store — one individual\'s memory — under the body\'s name. ' +
    '201 serves the name back. The management surface\'s gesture: a store grant ' +
    'never manages.',
  tags: ['stores'],
  request: { body: { content: { 'application/json': { schema: NameBodySchema } }, required: true } },
  responses: { 201: { description: 'the store exists' } },
});

const listStores = createRoute({
  method: 'get',
  path: '/stores',
  summary: 'list the stores',
  description:
    'Every open store as a descriptor: its name and its stats. The server\'s ' +
    'registry is the inventory — the store\'s path never crosses the wire.',
  tags: ['stores'],
  responses: { 200: { description: 'every open store, by name with its stats' } },
});

const describeStore = createRoute({
  method: 'get',
  path: '/stores/{name}',
  summary: 'describe a store',
  description:
    'One store\'s descriptor: the name and its stats — the five-key ledger: ' +
    'population by status and by kind, edges, edges by kind.',
  tags: ['stores'],
  request: { params: z.object({ name: storesNameParam }) },
  responses: { 200: { description: 'the descriptor' } },
});

const forkStore = createRoute({
  method: 'post',
  path: '/stores/{name}/fork',
  summary: 'fork a store',
  description:
    'An exact copy of the store as a new store — a backup, or a state set aside to ' +
    'examine. Born unreached: no credential reaches the copy until one is minted ' +
    'for it. The body\'s name is optional — composed from the source\'s name when ' +
    'silent; 201 serves the fork\'s name. The manager\'s gesture: forking never ' +
    'makes one individual two.',
  tags: ['stores'],
  request: {
    params: z.object({ name: storesNameParam }),
    body: { content: { 'application/json': { schema: ForkBodySchema } }, required: false },
  },
  responses: { 201: { description: 'the fork exists — the forked name is the payload' } },
});

const deleteStore = createRoute({
  method: 'delete',
  path: '/stores/{name}',
  summary: 'delete a store',
  description:
    'The store, its memories and its edges are gone — irreversible. No ' +
    'confirmation parameter: reaching this route is the confirmation.',
  tags: ['stores'],
  request: { params: z.object({ name: storesNameParam }) },
  responses: { 204: { description: 'gone — the store, irreversibly' } },
});

// ——— The rituals family, with the drafted texts.

const checkinLimit = z.coerce
  .number()
  .int()
  .min(1)
  .optional()
  .describe('an explicit session block: integer ≥ 1, no ceiling — the absent limit stays absent');

const checkin = createRoute({
  method: 'get',
  path: '/checkin',
  summary: 'open a session',
  description:
    'The session-start ritual: the hot memories with their relations, the store\'s ' +
    'stats, the waking guidance — one call, newest first. Reading the register is ' +
    'not writing it: read-only grants open here.',
  tags: ['rituals'],
  request: { query: z.object({ limit: checkinLimit }) },
  responses: { 200: { description: 'the hot block (newest first) and the store stats' } },
});

const checkout = createRoute({
  method: 'get',
  path: '/checkout',
  summary: 'close a session',
  description:
    'The session-end verdict: the store reports its consolidation debts — the hot ' +
    'block missing, living memories with no edges (islands), duplicate titles — ' +
    'each payable with the write verbs; healthy lands true only when every debt ' +
    'is paid. Corruption is not the gate\'s business — the operator\'s doctor ' +
    'audits it.',
  tags: ['rituals'],
  responses: { 200: { description: 'the consolidation verdict — healthy or the payable findings' } },
});

// ——— Fold and dump: the served shape the owner reacts to.

const app = new OpenAPIHono();
for (const route of [
  createStore,
  listStores,
  describeStore,
  forkStore,
  deleteStore,
  checkin,
  checkout,
]) {
  app.openapi(route, (c) => c.json({}, 200));
}
app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'souvenance', version: 'prototype', description: infoDescription },
});

const res = await app.request('/doc');
const doc = await res.json();
console.log(JSON.stringify(doc, null, 2));
