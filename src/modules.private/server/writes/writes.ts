/**
 * The write routes (slice 4, #19's data-write block): the facade's seven
 * write verbs made HTTP, the bodies mirroring the facade's options
 * verbatim (kind required at store, optional at supersede/merge — the
 * inheritance the kind column ruled, #31; the birth curation `hot` rides
 * store's body alone, #85 — the transfer and union rules own supersede's
 * and merge's heads). The created answer is the id
 * (Q21); the mute writes answer 204 (Q19); the created edge echoes
 * itself without inventing a created_at the facade never returned (Q20).
 * Every handler walks the gates in order: family (403 — management
 * reaches no store's data), then existence in the registry (404 — the
 * orphaned grant's answer), then mode (403 ro — reads are open to ro,
 * writes never), then the facade, whose refusals ride the envelope
 * (400 invalid, 404 unknown, 409 status fights). The grant IS the
 * address (ADR 0007): no path segment names the store.
 *
 * Every body is strict (#60): an unknown key refuses 400 with the
 * envelope teaching, never strips — a silently-dropped authored field is
 * how an agent's model and the store's truth diverge. What the wire
 * serves, /doc declares (`additionalProperties: false`).
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { writableStore } from '../reached-store/reached-store.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';
import {
  invalidRefusal,
  MemoryIdParamsSchema,
  payloadRefusal,
  refusal,
  unknownMemoryRefusal,
  unknownStoreRefusal,
} from '../wire/wire.ts';
import type { MetadataValue } from '../../store/store.ts';

/** The one-gesture relations: the facade's RelationSpec verbatim, strict — an edge carries exactly its `to` and its `kind` (#60). */
const RelationsSchema = z
  .array(
    z.strictObject({
      to: z.uuid().describe("the related memory's id"),
      kind: z.string().describe("the edge's kind"),
    }),
  )
  .optional()
  .describe(
    'relations born with the memory — one gesture, each edge carrying its target and its kind',
  );

/**
 * The authored metadata on the write surface. The OpenAPI converter
 * cannot recurse declared records (a self-cycling `z.record` 500s the
 * /doc), so the schema stays structurally loose and the contract reads
 * twice: here in the description, and in the facade's teaching refusals
 * — the gate is the facade's `validateMetadata`, one home, one voice
 * (#40 keys, #51 values). The wire's `as` bridge to the facade's narrow
 * type follows the `parsed as MetadataFilters` precedent of reads.ts.
 */
const MetadataShape = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    'keys are one path segment each (letters, digits, "-", "_"); values are scalars ' +
      '(string | number | boolean) or nested objects of them — arrays and null never author: ' +
      'the filter cannot ask for either',
  );
const SummaryShape = z
  .string()
  .optional()
  .describe(
    'the authored condensation — owed when the content runs past the ceiling; revised by supersede, never in place',
  );

const StoreBodySchema = z.strictObject({
  content: z.string(),
  kind: z.string().describe("the memory's kind — demanded at birth, a free vocabulary"),
  summary: SummaryShape,
  metadata: MetadataShape,
  relations: RelationsSchema,
  hot: z
    .boolean()
    .optional()
    .describe(
      "the birth curation — the memory lands hot: the sub-state a fresh session's checkin serves",
    ),
});
const SupersedeBodySchema = z.strictObject({
  content: z.string(),
  kind: z
    .string()
    .optional()
    .describe("the successor's kind — rides along when absent, reclassifies when present"),
  summary: SummaryShape,
  metadata: MetadataShape,
  relations: RelationsSchema,
});
const MergeBodySchema = z.strictObject({
  ids: z.array(z.uuid()).describe('the sources — at least two; they become one'),
  content: z.string(),
  kind: z
    .string()
    .optional()
    .describe("the fusion's kind — when absent, the sources must agree on it"),
  summary: SummaryShape,
  metadata: MetadataShape,
});
const HotBodySchema = z.strictObject({
  hot: z
    .boolean()
    .describe(
      'the verdict — true lands the memory in the hot block, false cools it back to active',
    ),
});
const LinkBodySchema = z.strictObject({
  to: z.uuid().describe("the target memory's id — self-edges refuse"),
  kind: z.string().describe("the edge's kind — non-empty"),
  /**
   * The EDGE metadata: free-form JSON on purpose — the typed filter
   * addresses memories' metadata, never edges' — so no addressability
   * obligation gates it (#51's ruling).
   */
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('free-form JSON — edges sit outside the filter reach'),
});
const UnlinkBodySchema = z.strictObject({
  to: z.uuid().describe("the edge's target"),
  kind: z.string().optional().describe("the edge's kind — needed when the edges are ambiguous"),
});

const CreatedSchema = z.object({ id: z.string() });
const EdgeEchoSchema = z.object({ from_id: z.string(), to_id: z.string(), kind: z.string() });

const statusRefusal = () => refusal('the memory fights its status');

export function registerWriteRoutes(app: OpenAPIHono<ServerEnv>, registry: Registry): void {
  const createMemory = createRoute({
    method: 'post',
    path: '/memories',
    summary: 'author a memory',
    description:
      'Births a memory: the content and its kind — demanded at birth — plus the authored ' +
      'summary, metadata, relations born with it, and the birth curation (hot). 201 ' +
      'serves the id — the created answer is the id.',
    tags: ['memories'],
    request: {
      body: { content: { 'application/json': { schema: StoreBodySchema } }, required: true },
    },
    responses: {
      201: {
        description: 'created — the id is the payload',
        content: { 'application/json': { schema: CreatedSchema } },
      },
      400: invalidRefusal('the body refuses — kind required, summary ceiling, grammar'),
      404: unknownStoreRefusal(),
      413: payloadRefusal(),
    },
  });
  app.openapi(createMemory, (c) => {
    const store = writableStore(c, registry);
    const body = c.req.valid('json');
    const id = store.store(body.content, {
      kind: body.kind,
      summary: body.summary,
      // Same bridge as supersede's: the facade gates, the wire passes
      // verbatim (the converter cannot carry the declared recursion).
      metadata: body.metadata as Record<string, MetadataValue> | undefined,
      relations: body.relations,
      hot: body.hot,
    });
    return c.json({ id }, 201);
  });

  const supersedeMemory = createRoute({
    method: 'post',
    path: '/memories/{id}/supersede',
    summary: 'revise a memory',
    description:
      'The revision gesture: the content moves to a successor — the old turns superseded ' +
      '(a terminal: it refuses every gesture), the head carries the relations, and the ' +
      "kind rides along unless the body reclassifies. 201 serves the successor's id.",
    tags: ['memories'],
    request: {
      params: MemoryIdParamsSchema,
      body: { content: { 'application/json': { schema: SupersedeBodySchema } }, required: true },
    },
    responses: {
      201: {
        description: 'the successor exists — its id is the payload',
        content: { 'application/json': { schema: CreatedSchema } },
      },
      400: invalidRefusal('the body refuses — summary ceiling, kind grammar'),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
      413: payloadRefusal(),
    },
  });
  app.openapi(supersedeMemory, (c) => {
    const { id } = c.req.valid('param');
    const store = writableStore(c, registry);
    const body = c.req.valid('json');
    const successor = store.supersede(id, body.content, {
      kind: body.kind,
      summary: body.summary,
      // The wire passes the authored metadata verbatim; the facade's
      // validateMetadata is the gate (the OpenAPI converter cannot carry
      // the declared recursion — the `as` bridge reads reads.ts's
      // MetadataFilters precedent).
      metadata: body.metadata as Record<string, MetadataValue> | undefined,
      relations: body.relations,
    });
    return c.json({ id: successor }, 201);
  });

  const deprecateMemory = createRoute({
    method: 'post',
    path: '/memories/{id}/deprecate',
    summary: 'retire a memory',
    description:
      'The retirement gesture: the memory turns deprecated — a terminal — and every ' +
      'gesture refuses it afterward. Mute: 204, nothing to say.',
    tags: ['memories'],
    request: { params: MemoryIdParamsSchema },
    responses: {
      204: { description: 'deprecated — nothing to say' },
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
      413: payloadRefusal(),
    },
  });
  app.openapi(deprecateMemory, (c) => {
    const { id } = c.req.valid('param');
    const store = writableStore(c, registry);
    store.deprecate(id);
    return c.body(null, 204);
  });

  const setHot = createRoute({
    method: 'post',
    path: '/memories/{id}/hot',
    summary: 'curate a memory',
    description:
      "The machine's only reversible edge: active ↔ hot. Hot is the curation status a " +
      "fresh session's checkin serves. 204 when the status lands.",
    tags: ['memories'],
    request: {
      params: MemoryIdParamsSchema,
      body: { content: { 'application/json': { schema: HotBodySchema } }, required: true },
    },
    responses: {
      204: { description: 'the status lands — nothing to say' },
      400: invalidRefusal('the body is not ours'),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
      413: payloadRefusal(),
    },
  });
  app.openapi(setHot, (c) => {
    const { id } = c.req.valid('param');
    const store = writableStore(c, registry);
    const { hot } = c.req.valid('json');
    store.setHot(id, hot);
    return c.body(null, 204);
  });

  const linkMemories = createRoute({
    method: 'post',
    path: '/memories/{id}/link',
    summary: 'relate two memories',
    description:
      "One directed edge, born with its kind: from the addressed memory to the body's " +
      'target. 201 serves the edge, echoing itself.',
    tags: ['memories'],
    request: {
      params: MemoryIdParamsSchema,
      body: { content: { 'application/json': { schema: LinkBodySchema } }, required: true },
    },
    responses: {
      201: {
        description: 'the edge exists — it echoes itself',
        content: { 'application/json': { schema: EdgeEchoSchema } },
      },
      400: invalidRefusal('the body refuses — self-edges refuse, kind must be non-empty'),
      404: unknownMemoryRefusal(),
      413: payloadRefusal(),
    },
  });
  app.openapi(linkMemories, (c) => {
    const { id } = c.req.valid('param');
    const store = writableStore(c, registry);
    const body = c.req.valid('json');
    store.link(id, body.to, body.kind, { metadata: body.metadata });
    return c.json({ from_id: id, to_id: body.to, kind: body.kind }, 201);
  });

  const unlinkMemories = createRoute({
    method: 'delete',
    path: '/memories/{id}/link',
    summary: 'unrelate two memories',
    description:
      'The edge is gone. Ambiguous edges — several to the same target — need the kind ' +
      'in the body to pick. 204 when the edge is gone.',
    tags: ['memories'],
    request: {
      params: MemoryIdParamsSchema,
      body: { content: { 'application/json': { schema: UnlinkBodySchema } }, required: true },
    },
    responses: {
      204: { description: 'the edge is gone — nothing to say' },
      400: invalidRefusal('the body is not ours — ambiguous edges need the kind'),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
      413: payloadRefusal(),
    },
  });
  app.openapi(unlinkMemories, (c) => {
    const { id } = c.req.valid('param');
    const store = writableStore(c, registry);
    const body = c.req.valid('json');
    store.unlink(id, body.to, body.kind);
    return c.body(null, 204);
  });

  const mergeMemories = createRoute({
    method: 'post',
    path: '/merge',
    summary: 'merge memories',
    description:
      "The fusion gesture: the body's sources become one — the content rewritten, the " +
      'sources bridging to the head as merged. The kind inherits when the sources agree ' +
      "and demands a verdict when they disagree. 201 serves the fusion's id.",
    tags: ['memories'],
    request: {
      body: { content: { 'application/json': { schema: MergeBodySchema } }, required: true },
    },
    responses: {
      201: {
        description: 'the fusion exists — its id is the payload; the sources bridge to it',
        content: { 'application/json': { schema: CreatedSchema } },
      },
      400: invalidRefusal('the body refuses — at least two memories, non-empty content'),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
      413: payloadRefusal(),
    },
  });
  app.openapi(mergeMemories, (c) => {
    const store = writableStore(c, registry);
    const body = c.req.valid('json');
    const fused = store.merge(body.ids, body.content, {
      kind: body.kind,
      summary: body.summary,
      // Same bridge as store's and supersede's: the facade gates.
      metadata: body.metadata as Record<string, MetadataValue> | undefined,
    });
    return c.json({ id: fused }, 201);
  });
}
