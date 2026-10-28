/**
 * The wire shapes of the read surface — zod schemas annotation-typed
 * against the FACADE's own interfaces (`z.ZodType<MemoryWithRelations>`
 * and friends), so one schema set validates and documents (ADR 0005)
 * and neither can drift: a field the facade renames is a compile error
 * here, the same discipline the stats pin gave the management slice.
 * The arrays keep the facade's readonly-ness (`z.array().readonly()`) —
 * the projection is served verbatim, no copies on the way out.
 */
import { z } from '@hono/zod-openapi';
import type {
  CheckinReport,
  CheckoutReport,
  MemoryWithRelations,
  OutEdge,
  Relation,
  SearchResult,
} from '../../store/store.ts';
import { STORE_NAME } from '../../config/config.ts';
import { MAX_LIMIT } from '../limits/limits.ts';

// ——— The routes' shared vocabulary: the shapes every route file speaks
// (the error envelope, the store-name param, the capped limit) live here
// once — three route files declared them apart before the review caught
// the drift waiting to happen.

export const ErrorSchema = z.object({ error: z.string() });

export const StoreNameSchema = z.string().regex(STORE_NAME);

export const StoreParamsSchema = z.object({ name: StoreNameSchema });

/** The explicit limit's shape: the cap judges only the explicit (Q18). */
export const limitShape = z.coerce.number().int().min(1).max(MAX_LIMIT).optional();

/** One documented refusal — the response keys stay literal at the call sites. */
export function refusal(description: string) {
  return {
    description,
    content: { 'application/json': { schema: ErrorSchema } },
  };
}

// ——— The refusals every route family shares, named once: the drift the
// reviews keep catching is the same teaching re-typed apart.

export const foreignRefusal = () => refusal('the grant reaches another store');
export const unknownStoreRefusal = () => refusal('no such store');
export const unknownMemoryRefusal = () => refusal('no such memory');
export const invalidRefusal = (description: string) => refusal(description);

const relationShape = {
  from_id: z.string(),
  to_id: z.string(),
  kind: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
};

export const RelationSchema: z.ZodType<Relation> = z.lazy(() => z.object(relationShape));

export const OutEdgeSchema: z.ZodType<OutEdge> = z.lazy(() =>
  z.object({ ...relationShape, target: z.union([MemoryNodeSchema, z.null()]) }),
);

const memoryShape = {
  id: z.string(),
  content: z.string(),
  kind: z.string(),
  summary: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  status: z.enum(['active', 'hot', 'superseded', 'deprecated', 'merged']),
};

const nodeShape = {
  ...memoryShape,
  relations: z.object({
    out: z.array(OutEdgeSchema).readonly(),
    in: z.array(RelationSchema).readonly(),
  }),
};

export const MemoryNodeSchema: z.ZodType<MemoryWithRelations> = z.lazy(() => z.object(nodeShape));

export const SearchHitSchema: z.ZodType<SearchResult> = z.lazy(() =>
  z.object({ ...nodeShape, rank: z.number() }),
);

export const CheckinReportSchema: z.ZodType<CheckinReport> = z.lazy(() =>
  z.object({
    hot: z.array(MemoryNodeSchema).readonly(),
    stats: z.object({
      memories: z.number(),
      memories_by_status: z.record(z.string(), z.number()).readonly(),
      memories_by_kind: z.record(z.string(), z.number()).readonly(),
      edges: z.number(),
      edges_by_kind: z.record(z.string(), z.number()).readonly(),
    }),
  }),
);

export const CheckoutReportSchema: z.ZodType<CheckoutReport> = z.lazy(() =>
  z.object({
    healthy: z.boolean(),
    findings: z
      .array(
        z
          .object({
            check: z.enum(['no_hot', 'isolated_living', 'duplicate_titles']),
            id: z.string().optional(),
            detail: z.string(),
            hint: z.string(),
          })
          .readonly(),
      )
      .readonly(),
    summary: z.object({
      checks: z.number(),
      issues: z.number(),
      memories: z.number(),
      hot_memories: z.number(),
    }),
  }),
);
