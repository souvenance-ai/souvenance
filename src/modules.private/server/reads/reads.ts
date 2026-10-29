/**
 * The read routes (slice 3, #19's read contract): the list pages by the
 * opaque keyset cursor — `{memories, next_after}` (Q16: the envelope,
 * `null` when the page is exhausted), the filters ride repeated `kind`
 * params (IN semantics, Q17) and the one URL-encoded `metadata` JSON
 * object (Q3), `include_terminals` is a presence flag; get serves the
 * projection at the asked depth (unknown → 404, teaching); search is
 * limit-only — bare hits with their bm25 `rank`, no cursor (the rank is
 * unstable across corpus changes, #40). An explicit `limit` past the cap
 * refuses 400; ABSENT takes the server's DEFAULT_LIMIT (Q18 revised with
 * the dev, 2026-10-28: the unbounded verbatim let the facade's own
 * default truncate silently — an explicit page every time keeps the peek
 * honest); the reach gate refuses a foreign store before existence is
 * spoken (Q8).
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { DEFAULT_LIMIT } from '../limits/limits.ts';
import { decodeCursor, encodeCursor } from '../cursor-token/cursor-token.ts';
import { reachedStore } from '../reached-store/reached-store.ts';
import { StoreError } from '../../store/store-error/store-error.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';
import type { MetadataFilters } from '../../store/utils/compile-read-filters/compile-read-filters.ts';
import {
  ErrorSchema,
  foreignRefusal,
  invalidRefusal,
  limitShape,
  MemoryIdParamsSchema,
  MemoryNodeSchema,
  SearchHitSchema,
  depthShape,
  StoreParamsSchema,
  unknownStoreRefusal,
} from '../wire/wire.ts';

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
    // probe for the client. Absent limit takes the server's page default
    // (Q18 revised): an explicit limit every time keeps the peek honest
    // and the facade's own default out of the wire.
    const limit = query.limit ?? DEFAULT_LIMIT;
    const rows = store.list({
      after,
      limit: limit + 1,
      kind: query.kind,
      metadata: metadataFilters(query.metadata),
      includeTerminals: query.include_terminals !== undefined,
    });
    const hasMore = rows.length > limit;
    const memories = hasMore ? rows.slice(0, limit) : rows;
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
      params: MemoryIdParamsSchema,
      query: z.object({ depth: depthShape }),
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
      throw new StoreError('not_found', `memory not found: ${id}`);
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
      limit: query.limit ?? DEFAULT_LIMIT,
      kind: query.kind,
      metadata: metadataFilters(query.metadata),
      includeTerminals: query.include_terminals !== undefined,
    });
    return c.json(hits, 200);
  });
}
