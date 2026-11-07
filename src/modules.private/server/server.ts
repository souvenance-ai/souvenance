/**
 * The HTTP server's skeleton (#20 slice 1): the public doors (/healthz,
 * /doc + its conventional alias /openapi.json, /docs, the root pointer —
 * shape disclosure only, Q7; the living test burned two agent lives
 * knocking on mute doors — #62), the guarded namespaces every
 * credential-bearing route mounts into (#74: management under /stores/*,
 * the data surface at the root — the grant IS the address), the refusal
 * envelope ({error: message}), and the caps. StoreError codes map to
 * statuses once, here — the honest mapping the typed refusals exist for
 * (Q2); a non-StoreError is an internal error and busy is an opaque 503,
 * both keeping their internals on the operator's stderr, never on the
 * wire (#19: 500/503 do not disclose).
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import type { CredentialFamilies } from '../config/config.ts';
import { StoreError } from '../store/store-error/store-error.ts';
import { auth, requireManagement, type ServerEnv } from './auth/auth.ts';
import { LiveCredentials, type CredentialDoors } from './live-credentials/live-credentials.ts';
import { rateLimit } from './rate-limit/rate-limit.ts';
import { registerManagementRoutes } from './management/management.ts';
import { registerGrantRoutes } from './grants/grants.ts';
import { registerReadRoutes } from './reads/reads.ts';
import { registerRitualRoutes } from './rituals/rituals.ts';
import { registerWriteRoutes } from './writes/writes.ts';
import { registerSkillRoutes } from './skills-routes/skills-routes.ts';
import { START_SKILL_NAME, Skills } from './skills/skills.ts';
import { MAX_BODY_BYTES } from './limits/limits.ts';
import type { Registry } from './registry/registry.ts';
import { HTTPException } from 'hono/http-exception';
import { errorStatus } from './error-status/error-status.ts';
import { requestLog } from './request-log/request-log.ts';
import {
  CheckinReportSchema,
  CheckoutReportSchema,
  MemoryNodeSchema,
  OutEdgeSchema,
  SearchHitSchema,
} from './wire/wire.ts';

export interface ServerDeps extends CredentialFamilies {
  readonly registry: Registry;
  /** The package version the OpenAPI document carries. */
  readonly version?: string;
  /** The opt-in request log's JSONL path (#69); absent = the log is off. */
  readonly logRequests?: string;
  /** The skills directory override (#82); absent = the package's shipped skills. */
  readonly skillsDir?: string;
  /**
   * The one config file the credential doors author (#98, ADR 0009);
   * absent — a programmatic boot with inline credentials — the mint and
   * revoke refuse with the teaching, list serves the live state alone.
   */
  readonly configPath?: string;
}

export function createApp(deps: ServerDeps): OpenAPIHono<ServerEnv> {
  const app = new OpenAPIHono<ServerEnv>({
    // One schema set validates AND documents (ADR 0005) — and one error
    // shape: a zod refusal is formatted into the {error} envelope, never
    // zod's own success/error split.
    defaultHook: (result, c) => {
      if (!result.success) {
        const issues = result.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        return c.json({ error: `invalid request — ${issues}` }, 400);
      }
      return;
    },
  });

  // The opt-in request log (#69): mounted before everything — the public
  // doors, the refusals, the 404 — one JSONL line per request after the
  // response settles. Off = never mounted: byte-identical behavior.
  if (deps.logRequests !== undefined) {
    app.use('*', requestLog({ path: deps.logRequests }));
  }

  // The public doors — no data, only shape and liveness (Q7). The living
  // test burned two agent lives knocking on mute doors (#62): the root
  // pointer answers the bare-host knock, the conventional /openapi.json
  // answers the reflex, and /doc stays the canonical document.
  app.get('/healthz', (c) => c.json({ ok: true }));
  const version = deps.version ?? '0.2.0';
  // The document's info carries the Teaching (the glossary's voice,
  // engine-agnostic): what souvenance is and how the surfaces split.
  const docOptions = {
    openapi: '3.0.0',
    info: {
      title: 'souvenance',
      version,
      description:
        'Persistent, searchable memory for AI agents: typed graphs of memories in ' +
        'stores, served over HTTP.\n\n' +
        "One store is one individual's memory. The grant is the address: a store " +
        'grant (Bearer) pins one store, read or read-write, and the data routes — ' +
        '/memories, /search, /checkin, /checkout — carry no store name. The ' +
        'management surface under /stores names stores; only a management grant ' +
        'reaches it, a store grant never touches it.\n\n' +
        'Every refusal is one JSON doc, {error: message}, and the message teaches: ' +
        'the wire carries its grammar in the refusals. The waking posture is ' +
        'served, not stored — GET /skills and its start skill teach how to wake, ' +
        'session, and consolidate; this document teaches the wire itself.',
    },
  };
  app.doc('/doc', docOptions);
  app.doc('/openapi.json', docOptions);
  app.get('/docs', swaggerUI({ url: '/doc' }));
  app.get('/', (c) =>
    c.json({
      name: 'souvenance',
      version,
      healthz: '/healthz',
      doc: '/doc',
      docs: '/docs',
      skills: '/skills',
      start: `/skills/${START_SKILL_NAME}`,
      waking: 'you are waking an individual — this store is your memory, not an API',
    }),
  );

  // The recursive wire shapes must be NAMED components: the OpenAPI
  // generator inlines every schema it walks, and a recursion inlined is
  // an infinite walk — registered, the cycle emits $ref instead.
  for (const [name, schema] of [
    ['MemoryNode', MemoryNodeSchema],
    ['OutEdge', OutEdgeSchema],
    ['SearchHit', SearchHitSchema],
    ['CheckinReport', CheckinReportSchema],
    ['CheckoutReport', CheckoutReportSchema],
  ] as const) {
    app.openAPIRegistry.register(name, schema);
  }

  // The envelope: every refusal one JSON doc, {error: message} (#19).
  // 503/500 never carry details (#19): busy reaches the client as its own
  // teaching (retry in a moment), while read_only (the manager's case —
  // the server never opens read-only) and every non-StoreError land in
  // the same opaque internal; the detail goes to the operator's stderr.
  const internal = (err: unknown, c: Context): Response => {
    process.stderr.write(`internal error: ${err instanceof Error ? err.stack : String(err)}\n`);
    return c.json({ error: 'internal error' }, 500);
  };
  app.onError((err, c) => {
    // Hono's own HTTP exceptions — the data routes' family and mode
    // refusals — ride the envelope with their status (read through the one
    // mapping the request log reads in flight, #69 — no drift).
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, errorStatus(err));
    }
    if (!(err instanceof StoreError)) return internal(err, c);
    const status = errorStatus(err);
    // busy is neither the client's mistake nor an internal: the store is
    // alive and the request was honest — the refused answer is opaque all
    // the same (#19: 500/503 do not disclose), the engine's raw message
    // (SQLITE_BUSY's own text) goes to the operator's stderr only.
    if (status === 503) {
      process.stderr.write(`store busy: ${err.message}\n`);
      return c.json({ error: 'the store is busy — retry in a moment' }, 503);
    }
    if (status === 500) return internal(err, c);
    return c.json({ error: err.message }, status);
  });
  // The 404 teaches: the envelope keeps its one shape, the message points
  // the way in (#62 — a mute 404 nearly cost a session its life) — and
  // now it teaches both families: the contract at /doc, the orientation
  // at /skills (#82).
  app.notFound((c) =>
    c.json(
      { error: 'no such route — the API document serves at /doc, orientation at /skills' },
      404,
    ),
  );

  // The guarded namespaces (#74): management under /stores/* — names are
  // its subject — and the data routes at the root, where the grant IS
  // the address. Auth first, then the rate limit (it reads the grant),
  // then the cap. The public doors (/, /healthz, /doc, /docs,
  // /openapi.json) stay outside: no token, no bucket, no cap.
  // `/memories/*` covers the bare `/memories` too (Hono's star matches
  // the namespace's root) — and every declared route's guard coverage is
  // pinned by the bare-401 sweep in server.test.ts.
  const guardedPaths = ['/stores/*', '/memories/*', '/search', '/merge', '/checkin', '/checkout'];
  const doors: CredentialDoors = { live: LiveCredentials.from(deps), configPath: deps.configPath };
  const bearer = auth(doors.live);
  const limiter = rateLimit();
  const capped = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: `body exceeds ${MAX_BODY_BYTES} bytes` }, 413),
  });
  for (const path of guardedPaths) {
    app.use(path, bearer);
    app.use(path, limiter);
    app.use(path, capped);
  }

  // The management gate (#63): the exact management paths only — the
  // management family serves them, a store grant refuses 403. The data
  // routes live at the root (#74) and serve store grants.
  app.use('/stores', requireManagement());
  app.use('/stores/:name', requireManagement());
  app.use('/stores/:name/fork', requireManagement());
  app.use('/stores/:name/grants', requireManagement());
  app.use('/stores/:name/grants/:agent', requireManagement());

  // The skills surface (#82): the directory is the truth, like the
  // registry — boot validates every skill or the boot fails, and half an
  // orientation is a lie the wire would serve as truth. The doors are
  // public: a skill teaches the grammar to whoever asks; it reaches no
  // individual's data.
  const skills = Skills.open(deps.skillsDir);

  registerManagementRoutes(app, deps.registry, doors);
  registerGrantRoutes(app, deps.registry, doors);
  registerReadRoutes(app, deps.registry);
  registerRitualRoutes(app, deps.registry, skills);
  registerWriteRoutes(app, deps.registry);
  registerSkillRoutes(app, skills, version);

  return app;
}
