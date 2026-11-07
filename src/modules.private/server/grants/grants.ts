/**
 * The grant routes on the management surface (slice 2, #98): the wire
 * door for minting, listing and revoking store grants — the operation
 * that had no door at all for a full-remote operator, leaving every fork
 * born unreached and unconsumable (the remote-mint gap, dev ruling 10
 * of the #48 grilling). The mint authors the one config file (ADR 0009)
 * and seats the row in the live credential state in the same synchronous
 * gesture — `fork → mint (ro) → consume` works with zero host-side
 * gesture, a remote restart being chicken-and-egg. The response carries
 * the secret exactly once; the list serves rows, never secrets;
 * revocation is immediate on both sources of truth. The store family
 * only: `management[]` rows stay host-local — a management grant that
 * mints management grants is recursive privilege; the host operator owns
 * who manages.
 *
 * One route group per file (the slices land as siblings on the same
 * assembly); the refusals ride the envelope: the family gate → 403
 * (mounted on the exact paths in the assembly), unknown store → 404, a
 * repeated (agent, store) pair → 409 (the rotation remedy taught:
 * revoke, then mint), the credential-file refusals through the one
 * mapping (drift → 409, an unreadable or unwritable file → 500 with the
 * running state unaffected).
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { Registry } from '../registry/registry.ts';
import type { ServerEnv } from '../auth/auth.ts';
import type { CredentialDoors } from '../live-credentials/live-credentials.ts';
import { ConfigError } from '../../config/config.ts';
import { mintStoreGrant } from '../../config/mint-store-grant/mint-store-grant.ts';
import { withoutStoreGrant } from '../../config/without-store-grant/without-store-grant.ts';
import {
  NoQuerySchema,
  STORE_NAME_TEACHING,
  StoreNameSchema,
  credentialRefusalOutcome,
  payloadRefusal,
  refusal,
  unknownStoreRefusal,
} from '../wire/wire.ts';

const AGENT_TEACHING =
  "the agent's label — the request log's caller axis; per-terminal labels make a compromised terminal attributable";

const GrantBodySchema = z.strictObject({
  agent: z.string().min(1).describe(AGENT_TEACHING),
  mode: z
    .enum(['ro', 'rw'])
    .describe("the grant's mode — ro reads, rw writes; changing it is revoke, then mint"),
});

/**
 * The minted row as 201 serves it: the config row plus its secret — the
 * one response that ever carries the secret (the list serves rows
 * without it, the file at 0600 holds it).
 */
const MintedGrantSchema = z
  .object({
    agent: z.string(),
    store: z.string(),
    mode: z.enum(['ro', 'rw']),
    secret: z.string(),
  })
  .describe(
    'the minted grant with its secret — served exactly once; nothing else ever serves the secret',
  );

/** A grant row as the list serves it — the secret is never on that wire. */
const GrantRowSchema = MintedGrantSchema.omit({ secret: true }).describe(
  'a grant row of the store family — the secret stays in the file at 0600, never here',
);

const GRANT_SCHEMA_PATH = '/stores/{name}/grants';
const GRANT_AGENT_PATH = '/stores/{name}/grants/{agent}';

const GRAMMAR_REFUSAL = () => refusal('the body or the path breaks the grammar');
const UNKNOWN_AGENT_REFUSAL = () => refusal('no grant for this agent on this store');

/** The 404 the store-existence check serves — named once for the trio. */
function unknownStore(c: Context<ServerEnv>, name: string) {
  return c.json({ error: `no store "${name}" in the registry` }, 404);
}

/** The teaching when the server had no file on record at the door. */
function noDocumentTeaching(c: Context<ServerEnv>, gesture: string) {
  return c.json(
    {
      error:
        `this server has no config file on record — the wire ${gesture}s by authoring the one config; ` +
        'boot with a config file, or own the credentials programmatically',
    },
    500,
  );
}

export function registerGrantRoutes(
  app: OpenAPIHono<ServerEnv>,
  registry: Registry,
  doors: CredentialDoors,
): void {
  const live = doors.live;
  const configPath = doors.configPath;
  const mintGrant = createRoute({
    method: 'post',
    path: GRANT_SCHEMA_PATH,
    summary: 'mint a store grant',
    description:
      'Generates a fresh secret, authors the row into the one config file (created or kept 0600) ' +
      'and seats it in the live credential state — effective immediately, no restart. 201 serves ' +
      'the row with its secret, exactly once. The management surface\u2019s gesture: a remote fork ' +
      'is consumable through this door alone. Store family only — management rows stay host-local.',
    tags: ['grants'],
    request: {
      params: z.object({ name: StoreNameSchema }),
      query: NoQuerySchema,
      body: { content: { 'application/json': { schema: GrantBodySchema } }, required: true },
    },
    responses: {
      201: {
        description: 'the grant exists and is in the live state — its secret, exactly once',
        content: { 'application/json': { schema: MintedGrantSchema } },
      },
      400: GRAMMAR_REFUSAL(),
      403: refusal('a store grant reaches no management route'),
      404: unknownStoreRefusal(),
      409: refusal('the agent already holds a grant on this store, or the config file drifted'),
      500: refusal('the credential write refused — the config file is unreadable or unwritable'),
      413: payloadRefusal(),
    },
  });
  app.openapi(mintGrant, (c) => {
    const { name } = c.req.valid('param');
    if (configPath === undefined) return noDocumentTeaching(c, 'mint');
    const store = registry.get(name);
    if (store === undefined) return unknownStore(c, name);
    const { agent, mode } = c.req.valid('json');
    let minted;
    try {
      minted = mintStoreGrant(live, { agent, store: name, mode });
    } catch (err) {
      if (err instanceof ConfigError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
    try {
      live.authorAndSeat(configPath, minted.next);
    } catch (err) {
      const outcome = credentialRefusalOutcome(err, 'the mint');
      return c.json(outcome, outcome.status);
    }
    return c.json(
      {
        agent: minted.grant.agent,
        store: minted.grant.store,
        mode: minted.grant.mode,
        secret: minted.grant.secret,
      },
      201,
    );
  });

  const listGrants = createRoute({
    method: 'get',
    path: GRANT_SCHEMA_PATH,
    summary: 'list the store\u2019s grants',
    description:
      'The store-grant rows of this store, as the config and the live state hold them — the ' +
      'agents, their stores, their modes. The secrets are never served from this door: reveal ' +
      'is not a management gesture (the manager CLI\u2019s grant family reveals on a TTY, offline).',
    tags: ['grants'],
    request: {
      params: z.object({ name: StoreNameSchema }),
      query: NoQuerySchema,
    },
    responses: {
      200: {
        description: 'the store-grant rows — no secret ever rides this list',
        content: { 'application/json': { schema: z.array(GrantRowSchema).readonly() } },
      },
      403: refusal('a store grant reaches no management route'),
      404: unknownStoreRefusal(),
    },
  });
  app.openapi(listGrants, (c) => {
    const { name } = c.req.valid('param');
    const store = registry.get(name);
    if (store === undefined) return unknownStore(c, name);
    const rows = live.tokens
      .filter((row) => row.store === name)
      .map((row) => ({ agent: row.agent, store: row.store, mode: row.mode }));
    return c.json(rows, 200);
  });

  const revokeGrant = createRoute({
    method: 'delete',
    path: GRANT_AGENT_PATH,
    summary: 'revoke a store grant',
    description:
      'The (agent, store) grant is revoked on both sources of truth at once — the live state and ' +
      'the config file — effective immediately: the next request with the revoked secret refuses ' +
      '401. A drifted file refuses 409 (external hand edits stay restart-to-apply), an unreadable ' +
      'or unwritable one refuses 500 with the running state unaffected. ' +
      `The grammar: ${STORE_NAME_TEACHING}; the agent is the label.`,
    tags: ['grants'],
    request: {
      params: z.object({
        name: StoreNameSchema,
        agent: z.string().min(1).describe(AGENT_TEACHING),
      }),
      query: NoQuerySchema,
    },
    responses: {
      204: { description: 'gone — the grant, from the file and the live state' },
      403: refusal('a store grant reaches no management route'),
      404: UNKNOWN_AGENT_REFUSAL(),
      409: refusal('the config file drifted from the running state'),
      500: refusal('the credential write refused — the config file is unreadable or unwritable'),
      413: payloadRefusal(),
    },
  });
  app.openapi(revokeGrant, (c) => {
    const { name, agent } = c.req.valid('param');
    if (configPath === undefined) return noDocumentTeaching(c, 'revoke');
    const store = registry.get(name);
    if (store === undefined) return unknownStore(c, name);
    const removed = withoutStoreGrant(live, { agent, store: name });
    if (removed.count === 0) {
      return c.json({ error: `no grant for "${agent}" on this store` }, 404);
    }
    try {
      live.authorAndSeat(configPath, removed.next);
    } catch (err) {
      const outcome = credentialRefusalOutcome(err, 'the revocation');
      return c.json(outcome, outcome.status);
    }
    return c.body(null, 204);
  });
}
