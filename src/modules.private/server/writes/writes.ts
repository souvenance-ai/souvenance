/**
 * The write routes (slice 4, #19's data-write block): the facade's seven
 * write verbs made HTTP, the bodies mirroring the facade's options
 * verbatim (kind required at store, optional at supersede/merge — the
 * inheritance the kind column ruled, #31). The created answer is the id
 * (Q21); the mute writes answer 204 (Q19); the created edge echoes
 * itself without inventing a created_at the facade never returned (Q20).
 * Every handler walks the gates in order: reach (403 foreign, slice 3's
 * door), then mode (403 ro — reads are open to ro, writes never), then
 * the facade, whose refusals ride the envelope (400 invalid, 404
 * unknown, 409 status fights).
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { writableStore } from '../reached-store/reached-store.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';
import {
  foreignRefusal,
  invalidRefusal,
  MemoryIdParamsSchema,
  refusal,
  StoreParamsSchema,
  unknownMemoryRefusal,
  unknownStoreRefusal,
} from '../wire/wire.ts';
import type { MetadataValue } from '../../store/store.ts';

/** The one-gesture relations: the facade's RelationSpec verbatim. */
const RelationsSchema = z.array(z.object({ to: z.uuid(), kind: z.string() })).optional();

/**
 * The authored metadata on the write surface: the facade's grammar
 * mirrored — keys one path segment each, values scalar or nested objects
 * (#51's ruling). The validator's own teaching (facade, StoreError) is
 * the refusal the agent reads when it breaks the grammar on the wire.
 */
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
      'the filter cannot ask for either (#40, #51)',
  );
const SummaryShape = z.string().optional();

const StoreBodySchema = z.object({
  content: z.string(),
  kind: z.string(),
  summary: SummaryShape,
  metadata: MetadataShape,
  relations: RelationsSchema,
});
const SupersedeBodySchema = z.object({
  content: z.string(),
  kind: z.string().optional(),
  summary: SummaryShape,
  metadata: MetadataShape,
  relations: RelationsSchema,
});
const MergeBodySchema = z.object({
  ids: z.array(z.uuid()),
  content: z.string(),
  kind: z.string().optional(),
  summary: SummaryShape,
  metadata: MetadataShape,
});
const HotBodySchema = z.object({ hot: z.boolean() });
const LinkBodySchema = z.object({
  to: z.uuid(),
  kind: z.string(),
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
const UnlinkBodySchema = z.object({ to: z.uuid(), kind: z.string().optional() });

const CreatedSchema = z.object({ id: z.string() });
const EdgeEchoSchema = z.object({ from_id: z.string(), to_id: z.string(), kind: z.string() });

const statusRefusal = () => refusal('the memory fights its status');

export function registerWriteRoutes(app: OpenAPIHono<ServerEnv>, registry: Registry): void {
  const createMemory = createRoute({
    method: 'post',
    path: '/stores/{name}/memories',
    tags: ['memories'],
    request: {
      params: StoreParamsSchema,
      body: { content: { 'application/json': { schema: StoreBodySchema } }, required: true },
    },
    responses: {
      201: {
        description: 'created — the id is the payload',
        content: { 'application/json': { schema: CreatedSchema } },
      },
      400: invalidRefusal('the body refuses — kind required, summary ceiling, grammar'),
      403: foreignRefusal(),
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(createMemory, (c) => {
    const { name } = c.req.valid('param');
    const store = writableStore(c, registry, name);
    const body = c.req.valid('json');
    const id = store.store(body.content, {
      kind: body.kind,
      summary: body.summary,
      // Same bridge as supersede's: the facade gates, the wire passes
      // verbatim (the converter cannot carry the declared recursion).
      metadata: body.metadata as Record<string, MetadataValue> | undefined,
      relations: body.relations,
    });
    return c.json({ id }, 201);
  });

  const supersedeMemory = createRoute({
    method: 'post',
    path: '/stores/{name}/memories/{id}/supersede',
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
      403: foreignRefusal(),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
    },
  });
  app.openapi(supersedeMemory, (c) => {
    const { name, id } = c.req.valid('param');
    const store = writableStore(c, registry, name);
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
    path: '/stores/{name}/memories/{id}/deprecate',
    tags: ['memories'],
    request: { params: MemoryIdParamsSchema },
    responses: {
      204: { description: 'deprecated — nothing to say' },
      403: foreignRefusal(),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
    },
  });
  app.openapi(deprecateMemory, (c) => {
    const { name, id } = c.req.valid('param');
    const store = writableStore(c, registry, name);
    store.deprecate(id);
    return c.body(null, 204);
  });

  const setHot = createRoute({
    method: 'post',
    path: '/stores/{name}/memories/{id}/hot',
    tags: ['memories'],
    request: {
      params: MemoryIdParamsSchema,
      body: { content: { 'application/json': { schema: HotBodySchema } }, required: true },
    },
    responses: {
      204: { description: 'the status lands — nothing to say' },
      400: invalidRefusal('the body is not ours'),
      403: foreignRefusal(),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
    },
  });
  app.openapi(setHot, (c) => {
    const { name, id } = c.req.valid('param');
    const store = writableStore(c, registry, name);
    const { hot } = c.req.valid('json');
    store.setHot(id, hot);
    return c.body(null, 204);
  });

  const linkMemories = createRoute({
    method: 'post',
    path: '/stores/{name}/memories/{id}/link',
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
      403: foreignRefusal(),
      404: unknownMemoryRefusal(),
    },
  });
  app.openapi(linkMemories, (c) => {
    const { name, id } = c.req.valid('param');
    const store = writableStore(c, registry, name);
    const body = c.req.valid('json');
    store.link(id, body.to, body.kind, { metadata: body.metadata });
    return c.json({ from_id: id, to_id: body.to, kind: body.kind }, 201);
  });

  const unlinkMemories = createRoute({
    method: 'delete',
    path: '/stores/{name}/memories/{id}/link',
    tags: ['memories'],
    request: {
      params: MemoryIdParamsSchema,
      body: { content: { 'application/json': { schema: UnlinkBodySchema } }, required: true },
    },
    responses: {
      204: { description: 'the edge is gone — nothing to say' },
      400: invalidRefusal('the body is not ours — ambiguous edges need the kind'),
      403: foreignRefusal(),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
    },
  });
  app.openapi(unlinkMemories, (c) => {
    const { name, id } = c.req.valid('param');
    const store = writableStore(c, registry, name);
    const body = c.req.valid('json');
    store.unlink(id, body.to, body.kind);
    return c.body(null, 204);
  });

  const mergeMemories = createRoute({
    method: 'post',
    path: '/stores/{name}/merge',
    tags: ['memories'],
    request: {
      params: StoreParamsSchema,
      body: { content: { 'application/json': { schema: MergeBodySchema } }, required: true },
    },
    responses: {
      201: {
        description: 'the fusion exists — its id is the payload; the sources bridge to it',
        content: { 'application/json': { schema: CreatedSchema } },
      },
      400: invalidRefusal('the body refuses — at least two memories, non-empty content'),
      403: foreignRefusal(),
      404: unknownMemoryRefusal(),
      409: statusRefusal(),
    },
  });
  app.openapi(mergeMemories, (c) => {
    const { name } = c.req.valid('param');
    const store = writableStore(c, registry, name);
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
