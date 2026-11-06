/**
 * The tool table (#22): the wire's data routes mirrored 1:1 as MCP tools
 * — twelve data verbs plus the orientation door. The mirror rule runs
 * three ways: tool names are the route verbs, tool arguments are the
 * wire's field names field-for-field, and results are what the routes
 * serve, verbatim. Validation rides with it: the server's grammar is
 * the judge — the table passes arguments through and the wire's
 * teaching arrives inside the tool-level error, byte for byte. No local
 * re-validation, no local grammar, one judge.
 *
 * The descriptions compress each route's teaching — what the gesture is
 * for and what it refuses — so tools/list carries the practice the way
 * /doc carries the contract. The legacy's dead verbs (update, delete,
 * relations, tags, stats, doctor, finish) stay dead: their verdicts are
 * registered (backlog #28, the doctor is the manager's offline audit,
 * finish lives again as checkout), and the table never resurrects a
 * removed surface.
 *
 * A 204 answers `undefined` — the route's own "nothing to say" — which
 * the protocol loop serves as an empty content array. A text answer
 * (the skills' markdown body) passes through as a string. A JSON answer
 * serves as the route's shape.
 */
import { Bridge } from '../bridge/bridge.ts';
import type { McpTool } from '../mcp/mcp.ts';

/** The query-string builder: absent omitted, one value once, several repeated. */
function buildQuery(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, entry);
    }
  }
  return query;
}

/** The addressed-memory path segment — encoded, judged by the wire. */
function memoryPath(args: Readonly<Record<string, unknown>>, suffix: string): string {
  return `/memories/${encodeURIComponent(String(args['id']))}${suffix}`;
}

/**
 * The body builder: EVERYTHING the agent authored rides — absent keys
 * drop (undefined never serializes), path params drop (they are
 * addressing, not content), and any other key rides verbatim so the
 * wire's strictObject refuses it BY NAME. A silently-dropped authored
 * field diverges the agent's model from the store's truth — the #60
 * verdict holds at the bridge too: the tool forwards, the wire judges.
 */
function buildBody(args: Readonly<Record<string, unknown>>, drop: readonly string[] = []): unknown {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined && !drop.includes(key)) body[key] = value;
  }
  return body;
}

/**
 * The same posture for query tools: the known keys ride their shaped
 * grammar, every other authored key rides raw — the wire's strict query
 * refuses it by name, and the teaching arrives inside the tool-level
 * error. A legacy idiom (`where`) dies loudly, never silently.
 */
function rideUnknown(
  args: Readonly<Record<string, unknown>>,
  query: URLSearchParams,
  known: ReadonlySet<string>,
): void {
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || known.has(key)) continue;
    query.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
}

const ID_PROPERTY = { type: 'string', description: "the addressed memory's id" } as const;
const LIMIT_PROPERTY = {
  type: 'integer',
  minimum: 1,
  maximum: 1000,
  description: "an explicit page size — past the cap refuses; absent takes the server's default",
} as const;
const KIND_PROPERTY = {
  anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  description: 'one kind, or several (an IN filter)',
} as const;
const METADATA_PROPERTY = {
  type: 'object',
  additionalProperties: {
    anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'object' }],
  },
  description:
    'keys are one path segment each (letters, digits, "-", "_"); values are scalars or nested objects of them ' +
    '— arrays and null never author: the filter cannot ask for either',
} as const;
const RELATIONS_PROPERTY = {
  type: 'array',
  items: {
    type: 'object',
    properties: { to: { type: 'string' }, kind: { type: 'string' } },
    required: ['to', 'kind'],
  },
  description: 'outgoing edges created in the same call — the link verb stays for retro-fixes',
} as const;
const SUMMARY_PROPERTY = {
  type: 'string',
  maxLength: 400,
  description:
    'the authored condensation — owed when the content runs past the 400-character ceiling',
} as const;
const TERMINALS_PROPERTY = {
  type: 'boolean',
  description:
    'include the terminals (superseded, deprecated, merged) — the living set serves by default',
} as const;
const FILTER_PROPERTIES = {
  limit: LIMIT_PROPERTY,
  kind: KIND_PROPERTY,
  metadata: METADATA_PROPERTY,
  include_terminals: TERMINALS_PROPERTY,
} as const;

/**
 * The thirteen tools: twelve data verbs, one orientation door. The order
 * carries the practice — the rituals first, the write verbs, then the
 * reads, then the skills.
 */
export const TOOLS: readonly McpTool[] = [
  {
    name: 'checkin',
    description:
      "The session-start ritual in one call: the hot memories with their relations, the store's stats — " +
      'the waking guidance when the store speaks. Run this FIRST, before any work; an empty store is an ' +
      'unborn individual — run the setup skill first.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          description: 'an explicit session block; absent serves the whole hot block',
        },
      },
    },
    run: async (bridge: Bridge, args) => {
      const query = buildQuery({
        limit: args['limit'] === undefined ? undefined : String(args['limit']),
      });
      rideUnknown(args, query, new Set(['limit']));
      return bridge.call({ method: 'GET', path: '/checkin', query });
    },
  },
  {
    name: 'checkout',
    description:
      'The session-end verdict: the store reports its consolidation debts — no_hot, isolated_living, ' +
      'duplicate_titles — each payable with the write verbs; healthy lands true only when every debt is paid. ' +
      'Never close with an empty hot block: leave the line your future self reads.',
    inputSchema: { type: 'object', properties: {} },
    run: async (bridge: Bridge, args) => {
      const query = buildQuery({});
      rideUnknown(args, query, new Set());
      return bridge.call({ method: 'GET', path: '/checkout', query });
    },
  },
  {
    name: 'store',
    description:
      'Author a memory: the content and its kind — demanded at birth, a free vocabulary — plus the authored ' +
      'summary (owed past the 400-character ceiling), metadata, relations born with it, and the birth curation ' +
      "(hot: the memory lands in the fresh session's block). One concept per memory; returns {id}.",
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'markdown, self-contained, search keywords in the text',
        },
        kind: {
          type: 'string',
          description: "the memory's kind — demanded at birth, a free vocabulary",
        },
        summary: SUMMARY_PROPERTY,
        metadata: METADATA_PROPERTY,
        relations: RELATIONS_PROPERTY,
        hot: { type: 'boolean', description: 'the birth curation — true lands the memory hot' },
      },
      required: ['content', 'kind'],
    },
    run: async (bridge: Bridge, args) =>
      bridge.call({
        method: 'POST',
        path: '/memories',
        body: buildBody(args),
      }),
  },
  {
    name: 'supersede',
    description:
      'Revise a memory: the new content becomes the living head, the source turns superseded and links the ' +
      "successor via supersedes. The head inherits the source's outgoing edges — explicit relations replace " +
      'that inheritance verbatim; a reclassifying kind rides. Content is immutable; this is how it changes. Returns {id}.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_PROPERTY,
        content: { type: 'string', description: "the successor's content" },
        kind: {
          type: 'string',
          description: "the successor's kind — rides along when absent, reclassifies when present",
        },
        summary: SUMMARY_PROPERTY,
        metadata: METADATA_PROPERTY,
        relations: RELATIONS_PROPERTY,
      },
      required: ['id', 'content'],
    },
    run: async (bridge: Bridge, args) =>
      bridge.call({
        method: 'POST',
        path: memoryPath(args, '/supersede'),
        body: buildBody(args, ['id']),
      }),
  },
  {
    name: 'merge',
    description:
      'Fuse duplicates: the sources become one — the content rewritten, each source bridging to the head as ' +
      'merged. The kind inherits when the sources agree and demands a verdict when they disagree. Returns {id}.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'the sources — at least two',
        },
        content: { type: 'string', description: "the fusion's content" },
        kind: {
          type: 'string',
          description: "the fusion's kind — when absent, the sources must agree on it",
        },
        summary: SUMMARY_PROPERTY,
        metadata: METADATA_PROPERTY,
      },
      required: ['ids', 'content'],
    },
    run: async (bridge: Bridge, args) =>
      bridge.call({ method: 'POST', path: '/merge', body: buildBody(args) }),
  },
  {
    name: 'link',
    description:
      'Relate two memories: one directed edge, born with its kind, from the addressed memory to the target. ' +
      'An unlinked memory is an island; the relations option of store authors these in the same gesture.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_PROPERTY,
        to: { type: 'string', description: "the edge's target — self-edges refuse" },
        kind: { type: 'string', description: "the edge's kind — non-empty" },
        metadata: {
          type: 'object',
          description: 'free-form JSON — edges sit outside the filter reach',
        },
      },
      required: ['id', 'to', 'kind'],
    },
    run: async (bridge: Bridge, args) =>
      bridge.call({
        method: 'POST',
        path: memoryPath(args, '/link'),
        body: buildBody(args, ['id']),
      }),
  },
  {
    name: 'unlink',
    description:
      'Unrelate two memories: the edge is gone. Several edges to the same target need kind in the body to ' +
      'pick — the refusal names the candidates, never guesses; reversed pairs teach the reverse.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_PROPERTY,
        to: { type: 'string', description: "the edge's target" },
        kind: {
          type: 'string',
          description: "the edge's kind — needed when the edges are ambiguous",
        },
      },
      required: ['id', 'to'],
    },
    run: async (bridge: Bridge, args) =>
      bridge.call({
        method: 'DELETE',
        path: memoryPath(args, '/link'),
        body: buildBody(args, ['id']),
      }),
  },
  {
    name: 'deprecate',
    description:
      'Retire a memory: it turns deprecated — a terminal — and every gesture refuses it afterward. The living ' +
      'set stops serving it unless include_terminals rides.',
    inputSchema: { type: 'object', properties: { id: ID_PROPERTY }, required: ['id'] },
    run: async (bridge: Bridge, args) => {
      const query = buildQuery({});
      rideUnknown(args, query, new Set(['id']));
      return bridge.call({ method: 'POST', path: memoryPath(args, '/deprecate'), query });
    },
  },
  {
    name: 'setHot',
    description:
      "Curate a memory: hot is the status a fresh session's checkin serves; active is the register's default. " +
      "The machine's only reversible edge: active ↔ hot.",
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_PROPERTY,
        hot: {
          type: 'boolean',
          description: 'the verdict — true lands the memory in the hot block, false cools it back',
        },
      },
      required: ['id', 'hot'],
    },
    run: async (bridge: Bridge, args) =>
      bridge.call({
        method: 'POST',
        path: memoryPath(args, '/hot'),
        body: buildBody(args, ['id']),
      }),
  },
  {
    name: 'get',
    description:
      'Read one memory: the node with its out-edges expanded to depth — the in-edges stay raw rows. ' +
      'Unknown ids teach 404.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_PROPERTY,
        depth: {
          type: 'integer',
          minimum: 1,
          maximum: 4,
          description: 'how deep the out-edges expand — absent serves depth 1',
        },
      },
      required: ['id'],
    },
    run: async (bridge: Bridge, args) => {
      const query = buildQuery({
        depth: args['depth'] === undefined ? undefined : String(args['depth']),
      });
      rideUnknown(args, query, new Set(['id', 'depth']));
      return bridge.call({ method: 'GET', path: memoryPath(args, ''), query });
    },
  },
  {
    name: 'list',
    description:
      'Page the memories in serving order, newest first: {memories, next_after} — next_after is null when the ' +
      'page is exhausted; hand it back as after for the next page. The filters ride: kind (one or several), ' +
      'metadata (path → scalar), limit, include_terminals.',
    inputSchema: {
      type: 'object',
      properties: {
        after: {
          type: 'string',
          description: "the page cursor — hand back the previous page's next_after",
        },
        ...FILTER_PROPERTIES,
      },
    },
    run: async (bridge: Bridge, args) => {
      const query = buildQuery({
        after: args['after'] === undefined ? undefined : String(args['after']),
        limit: args['limit'] === undefined ? undefined : String(args['limit']),
        kind: args['kind'] as string | readonly string[] | undefined,
        metadata: args['metadata'] === undefined ? undefined : JSON.stringify(args['metadata']),
        include_terminals: args['include_terminals'] === true ? 'true' : undefined,
      });
      rideUnknown(
        args,
        query,
        new Set(['after', 'limit', 'kind', 'metadata', 'include_terminals']),
      );
      return bridge.call({ method: 'GET', path: '/memories', query });
    },
  },
  {
    name: 'search',
    description:
      "Search the store's content: FTS5 keyword search over the living set, BM25-ranked. Matches whole " +
      'tokens, not substrings — a single word is the broadest query; OR widens the net; quoted phrases match ' +
      'consecutive words; quote hyphenated identifiers. The hits carry their rank; the order is deterministic ' +
      'per read, the rank is not stable across corpus changes.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'the search text — non-empty' },
        ...FILTER_PROPERTIES,
      },
      required: ['q'],
    },
    run: async (bridge: Bridge, args) => {
      const query = buildQuery({
        q: args['q'] === undefined ? undefined : String(args['q']),
        limit: args['limit'] === undefined ? undefined : String(args['limit']),
        kind: args['kind'] as string | readonly string[] | undefined,
        metadata: args['metadata'] === undefined ? undefined : JSON.stringify(args['metadata']),
        include_terminals: args['include_terminals'] === true ? 'true' : undefined,
      });
      rideUnknown(args, query, new Set(['q', 'limit', 'kind', 'metadata', 'include_terminals']));
      return bridge.call({ method: 'GET', path: '/search', query });
    },
  },
  {
    name: 'skills',
    description:
      "The orientation surface: with no arguments, the index — every skill's name and description, the waking " +
      'posture first; with name, one skill\'s body served verbatim. Run with name "waking" at every wake.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "the skill's name — the index serves it" },
      },
    },
    run: async (bridge: Bridge, args) => {
      const query = buildQuery({});
      rideUnknown(args, query, new Set(['name']));
      return bridge.call({
        method: 'GET',
        path:
          args['name'] === undefined
            ? '/skills'
            : `/skills/${encodeURIComponent(String(args['name']))}`,
        query,
      });
    },
  },
];
