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
import type { Guidance, SkillEntry } from '../skills/skills.ts';
import { STORE_NAME } from '../../config/config.ts';
import { MAX_BODY_BYTES, MAX_DEPTH, MAX_LIMIT } from '../limits/limits.ts';
import { TEACHING } from '../../teaching/teaching.ts';

// ——— The routes' shared vocabulary: the shapes every route file speaks
// (the error envelope, the addressed-memory id param, the capped limit)
// live here once — three route files declared them apart before the
// review caught the drift waiting to happen.

export const ErrorSchema = z
  .object({ error: z.string().describe('what refused and why — the message teaches') })
  .describe('the one refusal envelope — every refusal is one JSON doc: {error: message}');

/**
 * The store-name grammar, taught once: bodies, path params and responses
 * all ride the same string — one teaching, many surfaces.
 */
export const STORE_NAME_TEACHING =
  'lowercase, starts with a letter, up to 32 characters (a-z, 0-9, dashes)';

export const StoreNameSchema = z.string().regex(STORE_NAME).describe(STORE_NAME_TEACHING);

/** The addressed-memory params: the id — the store rides the grant (#74). */
export const MemoryIdParamsSchema = z.object({
  id: z.uuid().describe(TEACHING.memoryId),
});

/**
 * The empty query: every declared route rides either no query string or a
 * strict one — an unknown param refuses 400 naming the key, never riding
 * silently past the wire. The raw doors (/healthz, /doc, /) declare no
 * schema and stay outside the grammar.
 */
export const NoQuerySchema = z.strictObject({});

/** The explicit limit's shape: the cap judges only the explicit (Q18). */
export const limitShape = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional()
  .describe(TEACHING.limitExplicit);

/**
 * Checkin's explicit limit keeps the facade's verbatim judgment — an
 * integer ≥ 1, NO ceiling: the 1000 cap is list/search's alone, and an
 * explicit session block follows "order guides attention, nothing
 * drops" (#50; the absent limit stays absent, no server default).
 */
export const checkinLimitShape = z.coerce
  .number()
  .int()
  .min(1)
  .optional()
  .describe(TEACHING.limitCheckin);

/** Get's projection depth: the wire caps the walk the facade leaves to its caller (#50). */
export const depthShape = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_DEPTH)
  .optional()
  .describe(TEACHING.depthProjection);

/** The stats' five-key ledger — the descriptor's and the checkin's shared shape. */
export const StatsSchema = z
  .object({
    memories: z.number(),
    memories_by_status: z.record(z.string(), z.number()).readonly(),
    memories_by_kind: z.record(z.string(), z.number()).readonly(),
    edges: z.number(),
    edges_by_kind: z.record(z.string(), z.number()).readonly(),
  })
  .describe(
    "the store's five-key ledger — memories, memories by status and kind, edges, edges by kind",
  );

/** One documented refusal — the response keys stay literal at the call sites. */
export function refusal(description: string) {
  return {
    description,
    content: { 'application/json': { schema: ErrorSchema } },
  };
}

// ——— The refusals every route family shares, named once: the drift the
// reviews keep catching is the same teaching re-typed apart. The
// foreign-store refusal retired with the nameless data routes (#74) —
// the grant IS the address, no request can name another store.

export const unknownStoreRefusal = () => refusal('no such store');
export const unknownMemoryRefusal = () => refusal('no such memory');
export const invalidRefusal = (description: string) => refusal(description);
/**
 * The one 413: the bodyLimit middleware serves it on any body past the
 * cap (the bodyLimit runs app-wide, before the route), and the write
 * routes annotate it — the document is the canon (#51's B09 finding: the
 * wire served what the declared responses forgot).
 */
export const payloadRefusal = () => refusal(`the body exceeds ${MAX_BODY_BYTES} bytes`);

const relationShape = {
  from_id: z.string(),
  to_id: z.string(),
  kind: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
};

export const RelationSchema: z.ZodType<Relation> = z.lazy(() => z.object(relationShape));

export const OutEdgeSchema: z.ZodType<OutEdge> = z.lazy(() =>
  z
    .object({ ...relationShape, target: z.union([MemoryNodeSchema, z.null()]) })
    .describe(
      'one directed edge from this memory — from_id, to_id, the edge kind, its authored ' +
        'metadata — and the target memory expanded, null when the projection stops at the depth',
    ),
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

export const MemoryNodeSchema: z.ZodType<MemoryWithRelations> = z.lazy(() =>
  z
    .object(nodeShape)
    .describe(
      'one memory with its relation graph — content, kind, the authored summary, metadata, ' +
        'created_at, the status (active | hot | superseded | deprecated | merged); ' +
        'the out-edges expand to the asked depth, the in-edges stay raw rows',
    ),
);

/** The search's rank teaching — the hit, the route and the response speak it once. */
export const SEARCH_RANK_TEACHING =
  'best match first — no cursor, the rank is unstable across writes';

export const SearchHitSchema: z.ZodType<SearchResult> = z.lazy(() =>
  z
    .object({ ...nodeShape, rank: z.number() })
    .describe('a hit — the served node plus its rank: ' + SEARCH_RANK_TEACHING),
);

export const CheckinReportSchema = z
  .object({
    hot: z.array(MemoryNodeSchema).readonly(),
    stats: StatsSchema,
  })
  .describe(
    "the session's opening state — the hot memories with their relations, and the store's stats",
  ) satisfies z.ZodType<CheckinReport>;

/**
 * The wire's voice beside the data (#82): one imperative line, one skill
 * pointer — optional on the success responses that carry it, never on the
 * errors (the refusals keep teaching through their message).
 */
export const GuidanceSchema: z.ZodType<Guidance> = z
  .object({
    line: z.string().describe('one imperative line — the posture the moment needs'),
    skill: z.string().describe("the skill's name that answers the line — the index serves it"),
  })
  .describe('the waking voice beside the data — a line, and the skill that answers it');

/**
 * The served checkin (#82): the report plus the waking voice — the
 * guidance rides the success response beside the data, one section per
 * response, store-empty overriding always on the same route.
 */
export interface ServedCheckinReport extends CheckinReport {
  readonly guidance?: Guidance;
}

export const ServedCheckinReportSchema = CheckinReportSchema.extend({
  guidance: GuidanceSchema.optional(),
}).describe(
  "the session's opening state — the hot memories with their relations, the store's stats, " +
    'and the guidance: the waking voice beside the data',
) satisfies z.ZodType<ServedCheckinReport>;

/** One skills-index row (#82): the name and the startup-visible hint. */
export const SkillEntrySchema: z.ZodType<SkillEntry> = z.object({
  name: z.string().describe("the skill's name"),
  description: z.string().describe('the one-line teaching the index serves'),
});

/** The skills index (#82): the serving product's version, the start skill first. */
export interface SkillsIndex {
  readonly version: string;
  readonly skills: readonly SkillEntry[];
}

export const SkillsIndexSchema: z.ZodType<SkillsIndex> = z
  .object({
    version: z.string(),
    skills: z.array(SkillEntrySchema).readonly(),
  })
  .describe(
    "the orientation surface's index — the serving product's version and every skill, the start skill first",
  );

/** The checkout's debts, taught once — the enum and the route text speak the same list. */
export const CHECKOUT_DEBTS_TEACHING =
  'the hot block missing, living memories without edges (islands), duplicate titles';

export const CheckoutReportSchema: z.ZodType<CheckoutReport> = z.lazy(() =>
  z
    .object({
      healthy: z.boolean(),
      findings: z
        .array(
          z
            .object({
              check: z
                .enum(['no_hot', 'isolated_living', 'duplicate_titles'])
                .describe('which debt — ' + CHECKOUT_DEBTS_TEACHING),
              id: z.string().optional().describe("the owing memory's id, when the debt names one"),
              detail: z.string().describe('what was found'),
              hint: z.string().describe('the payment — the verb that pays this debt'),
            })
            .readonly(),
        )
        .readonly()
        .describe('the consolidation debts — each payable with the write verbs'),
      summary: z
        .object({
          checks: z.number(),
          issues: z.number(),
          memories: z.number(),
          hot_memories: z.number(),
          edges: z.number(),
        })
        .describe('the counts — checks run, issues owed, memories, hot memories, edges'),
    })
    .describe('the session-end verdict — healthy, the payable findings, and the summary counts'),
);
