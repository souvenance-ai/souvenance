/**
 * The read routes (slice 3, #19's read contract): the list pages by the
 * opaque keyset cursor — `{memories, next_after}` (Q16: the envelope,
 * `null` when the page is exhausted), the filters ride `kind` params —
 * repeated for IN, a lone one as its singleton array (#62) — and the one
 * URL-encoded `metadata` JSON
 * object (Q3), `include_terminals` is a presence flag; get serves the
 * projection at the asked depth (unknown → 404, teaching); search is
 * limit-only — bare hits with their bm25 `rank`, no cursor (the rank is
 * unstable across corpus changes, #40). An explicit `limit` past the cap
 * refuses 400; ABSENT takes the server's DEFAULT_LIMIT (Q18 revised with
 * the dev, 2026-10-28: the unbounded verbatim let the facade's own
 * default truncate silently — an explicit page every time keeps the peek
 * honest); the grant IS the address (#74) — the credential pins the
 * store, an orphaned grant serves 404. Every query grammar is strict
 * (`z.strictObject`): an unknown param refuses 400 naming the key — the
 * strip default would serve the request as if the param were absent.
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
import { TEACHING } from '../../teaching/teaching.ts';
import {
  ErrorSchema,
  SEARCH_RANK_TEACHING,
  invalidRefusal,
  limitShape,
  MemoryIdParamsSchema,
  MemoryNodeSchema,
  SearchHitSchema,
  depthShape,
  unknownStoreRefusal,
} from '../wire/wire.ts';

/**
 * The kind filter's language, both routes (list and search): repeated
 * `?kind=a&kind=b` narrows with IN semantics (Q17); a LONE `?kind=a` is
 * its one-element array — the form idiom the wire's own `type: array`
 * declaration speaks, the strict refusal of which burned a living agent
 * (#62). The /doc description rides the shared const.
 */
const kindShape = z.preprocess(
  (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]),
  z
    .array(z.string())
    .optional()
    .describe('repeat the param for several kinds (IN); a single value filters one kind'),
);
/**
 * The metadata param's language rides once on the shared const — both
 * filter routes (list and search) document the same grammar (#51): one
 * URL-encoded JSON object of path → scalar, the dot-paths walking the
 * stored objects (keys carry no dots, the segments are unambiguous),
 * typed equality (string | number | boolean), AND across paths. Array
 * values are not authored in the first place, so no index syntax exists.
 */
/**
 * The metadata filter's grammar, taught once — the shape and the list's
 * route text speak the same string, the STORE_NAME_TEACHING pattern.
 */
const METADATA_TEACHING =
  'one URL-encoded JSON object of dot-path → scalar (string | number | boolean), AND across paths';

const metadataShape = z.string().optional().describe(METADATA_TEACHING);
const includeTerminalsShape = z
  .string()
  .optional()
  .describe(
    'a presence flag — set it to serve the terminal memories too (superseded, deprecated, ' +
      'merged); absent serves the living only',
  );

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
    path: '/memories',
    summary: 'page the memories',
    description:
      "One page of the store's memories in serving order, newest first: " +
      '{memories, next_after} — next_after is null when the page is exhausted; hand it ' +
      'back as ?after for the next page. The filters ride: ?kind (repeat the param for ' +
      'IN), ?metadata (' +
      METADATA_TEACHING +
      '), ?limit, and the terminals flag.',
    tags: ['memories'],
    request: {
      query: z.strictObject({
        after: z.string().optional().describe(TEACHING.pageCursor),
        limit: limitShape,
        kind: kindShape,
        // The grammar's language rides on the shared const (list and
        // search document the same filter).
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
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(listMemories, (c) => {
    const store = reachedStore(c, registry);
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
    path: '/memories/{id}',
    summary: 'read a memory',
    description:
      'One memory as its projection: the node with its out-edges expanded to ?depth — ' +
      "the in-edges stay raw rows. 404 for an id the store doesn't hold.",
    tags: ['memories'],
    request: {
      params: MemoryIdParamsSchema,
      query: z.strictObject({ depth: depthShape }),
    },
    responses: {
      200: {
        description: 'the projection — out-edges expanded to the asked depth',
        content: { 'application/json': { schema: MemoryNodeSchema } },
      },
      400: invalidRefusal('the id or the depth is not ours'),
      404: {
        description: 'no such memory',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
  });
  app.openapi(getMemory, (c) => {
    const { id } = c.req.valid('param');
    const store = reachedStore(c, registry);
    const { depth } = c.req.valid('query');
    const memory = store.get(id, { depth });
    if (memory === null) {
      throw new StoreError('not_found', `memory not found: ${id}`);
    }
    return c.json(memory, 200);
  });

  const searchMemories = createRoute({
    method: 'get',
    path: '/search',
    summary: 'search the memories',
    description:
      "The store's content, searched: the hits, " +
      SEARCH_RANK_TEACHING +
      ". The list's filters ride: ?limit, ?kind, ?metadata, ?include_terminals.",
    tags: ['memories'],
    request: {
      query: z.strictObject({
        q: z.string().describe(TEACHING.searchText),
        limit: limitShape,
        kind: kindShape,
        metadata: metadataShape,
        include_terminals: includeTerminalsShape,
      }),
    },
    responses: {
      200: {
        description: 'the hits, ' + SEARCH_RANK_TEACHING,
        content: { 'application/json': { schema: z.array(SearchHitSchema) } },
      },
      400: invalidRefusal('the query or a filter is not ours — q must be non-empty'),
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(searchMemories, (c) => {
    const store = reachedStore(c, registry);
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
