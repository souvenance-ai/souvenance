/**
 * The read routes (slice 3, #19's read contract): the list pages by the
 * opaque keyset cursor — `{memories, next_after}` (Q16: the envelope,
 * `null` when the page is exhausted), the filters ride repeated `kind`
 * params (IN semantics, Q17) and the one URL-encoded `metadata` JSON
 * object (Q3), `include_terminals` is a presence flag; get serves the
 * projection at the asked depth (unknown → 404, teaching); search is
 * limit-only — bare hits with their bm25 `rank`, no cursor (the rank is
 * unstable across corpus changes, #40). An explicit `limit` past the cap
 * refuses 400 (the cap judges only the explicit, Q18); the reach gate
 * refuses a foreign store before existence is spoken (Q8).
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { MAX_LIMIT } from '../limits/limits.ts';
import { decodeCursor, encodeCursor } from '../cursor-token/cursor-token.ts';
import { reachedStore } from '../reached-store/reached-store.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';
import type { MetadataFilters } from '../../store/utils/compile-read-filters/compile-read-filters.ts';
import { MemoryNodeSchema, SearchHitSchema } from '../wire/wire.ts';
import { STORE_NAME } from '../../config/config.ts';

const StoreNameSchema = z.string().regex(STORE_NAME);
const StoreParamsSchema = z.object({ name: StoreNameSchema });
const ErrorSchema = z.object({ error: z.string() });

const limitShape = z.coerce.number().int().min(1).max(MAX_LIMIT).optional();
const kindShape = z.array(z.string()).optional();
const metadataShape = z.string().optional();
const includeTerminalsShape = z.string().optional();

/** The metadata param's parse: one URL-encoded JSON object, path → scalar. */
function metadataFilters(raw: string | undefined): MetadataFilters | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HTTPException(400, {
      message: 'metadata is a URL-encoded JSON object of path → scalar — this does not parse',
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HTTPException(400, {
      message:
        'metadata is a URL-encoded JSON object of path → scalar — not an array, not a scalar',
    });
  }
  return parsed as MetadataFilters;
}

const foreignRefusal = () => ({
  description: 'the grant reaches another store',
  content: { 'application/json': { schema: ErrorSchema } },
});
const unknownStoreRefusal = () => ({
  description: 'no such store',
  content: { 'application/json': { schema: ErrorSchema } },
});
const invalidRefusal = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export function registerReadRoutes(app: OpenAPIHono<ServerEnv>, registry: Registry): void {
  const listMemories = createRoute({
    method: 'get',
    path: '/stores/{name}/memories',
    tags: ['memories'],
    request: {
      params: StoreParamsSchema,
      query: z.object({
        after: z.string().optional(),
        limit: limitShape,
        kind: kindShape,
        metadata: metadataShape,
        include_terminals: includeTerminalsShape,
      }),
    },
    responses: {
      200: {
        description: 'one page in serving order; next_after is null when the page is exhausted',
        content: {
          'application/json': {
            schema: z.object({
              memories: z.array(MemoryNodeSchema),
              next_after: z.string().nullable(),
            }),
          },
        },
      },
      400: invalidRefusal('a cursor, limit or filter is not ours'),
      403: foreignRefusal(),
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(listMemories, (c) => {
    const { name } = c.req.valid('param');
    const store = reachedStore(c, registry, name);
    const query = c.req.valid('query');
    const after = query.after !== undefined ? decodeCursor(query.after) : undefined;
    if (query.after !== undefined && after === undefined) {
      return c.json(
        { error: 'the after cursor is not ours — take next_after from the previous page' },
        400,
      );
    }
    // The peek: one row past the page answers "is there more" — the
    // cursor is non-null exactly when a next page EXISTS, never an empty
    // probe for the client. Unbounded stays unbounded (Q18): everything
    // came back, there is no next page.
    const rows = store.list({
      after,
      limit: query.limit !== undefined ? query.limit + 1 : undefined,
      kind: query.kind,
      metadata: metadataFilters(query.metadata),
      includeTerminals: query.include_terminals !== undefined,
    });
    const hasMore = query.limit !== undefined && rows.length > query.limit;
    const memories = hasMore ? rows.slice(0, query.limit) : rows;
    const last = hasMore ? memories.at(-1) : undefined;
    // The token carries ONLY the keyset key — the whole node would leak
    // its content into an "opaque" token (MemoryWithRelations embeds the
    // key structurally, so tsc cannot catch the overreach).
    return c.json(
      {
        memories,
        next_after:
          last !== undefined ? encodeCursor({ created_at: last.created_at, id: last.id }) : null,
      },
      200,
    );
  });

  const getMemory = createRoute({
    method: 'get',
    path: '/stores/{name}/memories/{id}',
    tags: ['memories'],
    request: {
      params: z.object({ name: StoreNameSchema, id: z.uuid() }),
      query: z.object({ depth: z.coerce.number().int().min(1).optional() }),
    },
    responses: {
      200: {
        description: 'the projection — out-edges expanded to the asked depth',
        content: { 'application/json': { schema: MemoryNodeSchema } },
      },
      400: invalidRefusal('the id or the depth is not ours'),
      403: foreignRefusal(),
      404: {
        description: 'no such memory',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
  });
  app.openapi(getMemory, (c) => {
    const { name, id } = c.req.valid('param');
    const store = reachedStore(c, registry, name);
    const { depth } = c.req.valid('query');
    const memory = store.get(id, { depth });
    if (memory === null) {
      return c.json({ error: `memory not found: ${id}` }, 404);
    }
    return c.json(memory, 200);
  });

  const searchMemories = createRoute({
    method: 'get',
    path: '/stores/{name}/search',
    tags: ['memories'],
    request: {
      params: StoreParamsSchema,
      query: z.object({
        q: z.string(),
        limit: limitShape,
        kind: kindShape,
        metadata: metadataShape,
        include_terminals: includeTerminalsShape,
      }),
    },
    responses: {
      200: {
        description: 'the hits, best bm25 match first — no cursor, the rank is unstable',
        content: { 'application/json': { schema: z.array(SearchHitSchema) } },
      },
      400: invalidRefusal('the query or a filter is not ours — q must be non-empty'),
      403: foreignRefusal(),
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(searchMemories, (c) => {
    const { name } = c.req.valid('param');
    const store = reachedStore(c, registry, name);
    const query = c.req.valid('query');
    const hits = store.search(query.q, {
      limit: query.limit,
      kind: query.kind,
      metadata: metadataFilters(query.metadata),
      includeTerminals: query.include_terminals !== undefined,
    });
    return c.json(hits, 200);
  });
}
