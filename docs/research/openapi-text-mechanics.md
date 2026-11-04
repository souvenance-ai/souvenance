# Research: the pinned stack's teaching-text mechanics

Ticket #89 · researched 2026-11-04 against primary sources — the pinned packages' dist code and typings in `node_modules` (`@hono/zod-openapi` 1.6.3, `zod` 4.6.7, `@asteasolutions/zod-to-openapi` 9.1.0, `openapi3-ts` — the generator underneath the middleware) — plus live probes of this repo's own server: `createApp({ registry: {} as never })` + `app.request('/doc')` from a throwaway worktree, every claim below verified against a served document.

## TL;DR — every mechanism the text work needs is already wired

The baseline's silence (19 operations, 0 summaries, 0 descriptions) is **absence of text, absence of plumbing**. Route `summary`/`description`, `.describe()` on params and bodies, body-object text, request-body text, and component descriptions all flow to the served `3.0.0` document today. OpenAPI 3.0.0 strips nothing the current shapes need. The one structural trap is zod v4's `.describe()` **cloning** semantics — describe at the binding, never at the registration call site (probed: that mistake severs route-side `$ref`s and inlines the whole projection).

## Answers, one per bullet

| # | Mechanism | Verdict |
| - | --------- | ------- |
| 1 | Route `summary` / `description` in `createRoute` | **Served verbatim.** Any `OperationObject` key rides |
| 2 | zod v4 `.describe()` on query/param shapes | **Flows on both levels** (parameter object *and* its schema). Escape hatch exists: `.openapi({ param })` + `registerParameter` + raw route `parameters` — no `ZodOpenApiParameter` export |
| 3 | Body schema text (object + fields + body itself) | **All three flow** — field and object `.describe()` land in the schema; `request.body.description` lands on the Request Body |
| 4 | Component-registered schemas | **Description rides inside the component**, the `$ref` stays bare. The describe-at-binding pattern is load-bearing (see the trap) |
| 5 | What 3.0.0 strips vs 3.1 | Nullability representation, webhook generation, spec-legality of 3.1-only keys — nothing the drafted text needs |

## 1. Route-level text: verbatim through `createRoute` → `app.doc`

- `createRoute(config)` spreads the config untouched (`index.mjs:256-264`); `RouteConfig = Omit<OperationObject, 'responses'> & {method, path, request, responses}` plus `{middleware?, hide?}` (`@hono/zod-openapi/dist/index.d.mts:11-14`). The generator's `generatePath` destructures **only** `method, path, request, responses` and spreads the rest — `pathItemConfig` — straight into the served operation (`zod-to-openapi/dist/index.mjs:1538-1553`). So `summary`, `description`, `deprecated`, `operationId`, `tags`, `externalDocs`, `security`, `servers` all ride, and a raw `parameters` array can be declared at route level.
- `app.doc('/doc', docOptions)` builds the document **fresh on every request**: the handler runs `new OpenApiGeneratorV3(this.openAPIRegistry.definitions).generateDocument(config)` per hit (`index.mjs:186-197`), and `configureObject` may be a function of the Hono `Context` (`index.d.mts:129`) — texts can even be dynamic. The `openapi: '3.0.0'` string comes from `docOptions` (`src/modules.private/server/server.ts:80-85`); the 3.0 **structure** comes from the `doc` door itself.
- Probed: `summary` + `description` on two routes served byte-identical on both probed routes (`post /stores`, `get /memories`).

## 2. Parameter text: `.describe()` flows twice over; the hatch is `.openapi({ param })`

**Where the text lands.** For each field of a `params`/`query`/`cookies`/`headers` object the generator walks the shape and builds one ParameterObject (`generateInlineParameters`, `index.mjs:1297-1342` → `generateParameter`/`generateSimpleParameter`, `:1343-1372`). The parameter = `{ schema, required }` merged with `param`-metadata — and `Metadata.getParamMetadata` **promotes the schema-level `description` into the parameter-level `description`** (`index.mjs:332-337`, the `param` override wins if present). The same `.describe()` also rides inside the schema object. Probed: a new `.describe()` on the `after` param landed in **both** places, exactly like the baseline's `kind`/`metadata` texts do today.

**Survives the wrappers the repo actually uses.** `collectMetadata` unwraps `ZodOptional`/`ZodNullable`/`ZodDefault`/`ZodPipe` and merges each layer's metadata (`index.mjs:287-316`) — that is why the baseline's `kind` text (a `z.preprocess` → array → optional chain) already flows. Chain order is forgiving: describe-last registers on the outermost instance; describe-earlier survives via clone-parent inheritance (`zod/v4/core/registries.js:40-52`) or the unwrap. The one real severance is `.extend()` (see §4).

**The escape hatch.** The pinned `@hono/zod-openapi` exports **no** `ZodOpenApiParameter` type (full export list, `index.d.mts:240`; that name belonged to the zod-v3 line). The capability is zod-to-openapi's `ZodOpenAPIMetadata['param']` — `schema.openapi({ param: Partial<ParameterObject> })` — carrying `name`, `in`, `description`, `required`, `deprecated`, `example`/`examples`, `style`, `explode`, `allowReserved` (`dist/zod-extensions.d.ts:10-18`). `extendZodWithOpenApi(z)` runs at module load of the middleware (`index.mjs:265`), so `.openapi()` is already on every schema.
- Probed precedence: `param.description` overrides the promoted `.describe()` text **at the parameter level**, while the schema-level describe text stays beneath — the two texts coexist (`parameters[].description` vs `parameters[].schema.description`).
- `registry.registerParameter(name, schema)` produces a named component under `/components/parameters/` riding `$ref` from every route — but the schema must self-declare `.openapi({ param: { name, in } })` or generation refuses (`MissingParameterDataError: missingField 'in'`, probed). The component carries parameter-level text (probed: `LimitParam` with a description).
- Route-level raw `parameters`: because `RouteConfig` extends `OperationObject`, a route may inject raw ParameterObjects; they merge **ahead** of the generated ones (`index.mjs:1548`). Probed with a declared-but-never-validated `probe_raw` query param.

## 3. Body text: three layers, all served

Probed on `post /stores` (`src/modules.private/server/management/management.ts` shapes):

- **Field**: `StoreNameSchema.describe(...)` on the body's `name` → `requestBody.content['application/json'].schema.properties.name.description` ✓ (and, the const being shared, the same text served the 201 response's schema — the repo's shared-const idiom gets text reuse for free).
- **Object**: `NameSchema.describe(...)` chained at the binding → the body schema's own `description` ✓.
- **Body itself**: `request.body.description` (`ZodRequestBody.description`, `openapi-registry.d.ts`) → `requestBody.description` ✓ (the generator spreads it verbatim, `index.mjs:1484-1491`).

The void-statement trap: zod v4's `.describe()` **clones** — `describe(description) { const cl = this.clone(); core.globalRegistry.add(cl, { description }); return cl; }` (`zod/v4/classic/schemas.js:99-104`; same for `.meta()`). A discarded `Schema.describe('text')` statement is a no-op; the return value is the text carrier. Every describe must be chained into a binding (the `kindShape`/`metadataShape` pattern in `reads.ts` is already correct).

## 4. Component text: rides inside the component; the registration pattern is load-bearing

- A description on a registered schema lands in **`#/components/schemas/<Name>` itself**; the `$ref` emitted at call sites stays a bare `{$ref}` (no siblings) — `generateSimpleSchema` (`index.mjs:1433-1465`) and `generateSchemaWithRef` (`:1473-1480`). Consumers resolve the ref, so the text reaches Swagger UI and doc readers. Probed: `MemoryNode` component described, `get /memories/{id}` 200 → `{$ref: '#/components/schemas/MemoryNode'}`.
- **The trap (probed both ways).** `registry.register(name, schema)` wraps the schema in `.openapi(refId)` which **clones** and sets the refId on the clone; for `z.lazy` schemas the refId is also set on the *passed* instance (`setMetadata(this)`, `index.mjs:460-462`) — that is what lets route-side references emit `$ref`s today. Passing `register(name, Schema.describe('text'))` therefore registers a *fresh clone*: the component gets its description, but the route-side const never learns its refId, and **every route $ref severs** — the served projection inlined entirely (probe run 1: `get /memories/{id}` 200 became a full inline object; run 2 restored the `$ref`). The correct pattern: describe the const **at its binding** in `wire.ts` (before both registration and route use), then register the same const — refs intact in both the 3.0 and 3.1 doors (run 2).
- **`.extend()` severs everything** (no parent link, and the generator never unwraps an extended object): `ServedCheckinReportSchema = CheckinReportSchema.extend({...})` inherits neither refId nor description — the served `/checkin` 200 is an inline object today (`extend` clone shows `meta() === undefined`, probed). Text intended for the served checkin must ride `ServedCheckinReportSchema` itself (or the serving const re-bound after the extend). The checkout route uses the lazy `CheckoutReportSchema` const directly → it already rides `$ref: CheckoutReport` and a binding-time describe reaches it.

## 5. What 3.0.0 strips vs 3.1 — measured, not quoted

The same registry was served through both doors (`doc` with `openapi: '3.0.0'` and a throwaway `doc31` twin) and every node of the two documents diffed:

| Delta | 3.0.0 | 3.1.0 | Text impact |
| ----- | ----- | ----- | ----------- |
| Nullability | `nullable: true` (17 keys in this doc); a nullable **ref** becomes `allOf: [{$ref}, {nullable: true}]` | `type: ['string', 'null']`; nullable ref → `oneOf: [{$ref}, {type: 'null'}]` | None — descriptions ride the same objects |
| `type` values | 8 nodes reshaped (the same nullability) | | None |
| `webhooks` | **never generated** (the 3.0 generator has no webhook pass; 3.1 always emits `webhooks: {}`, even empty) | generated | Irrelevant to today's routes; a real ceiling if webhook routes ever land |
| `exclusiveMinimum/Maximum` | boolean style (`true` + `minimum`) | numeric | Current shapes use `min`/`max` → identical in both (probed); a future `.gt()` limit flips the shape |

Spec-legality for drafting: schema-level `summary` and `examples` arrays are 3.1-spec concepts; OAS 3.0 SchemaObject carries `title`, `description`, `example` (singular). **The generator does not version-filter user metadata** — probed: `.openapi({ examples: [...] })` landed the array inside the `3.0.0` document (illegal-but-served; the pinned `openapi3-ts` typings are loose enough to permit it). While the pin is 3.0.0: keep schema-level text to `description` (parameter-level `example`/`examples` are 3.0-legal). Note also that the version *string* and the version *structure* come from different places (`docOptions` vs the `doc`/`doc31` door) — mismatching them mislabels the document.

## Baseline (measured 2026-11-04, unmodified app)

Reproduced the ticket's numbers exactly: **19 operations / 0 operation summaries / 0 operation descriptions / 0 request-body descriptions; 22 parameters, 4 described** (`kind` + `metadata` on list and search — served at both levels) / **5 component schemas, 0 described**. Response descriptions are complete (19/19) — the refusal envelope's `refusal()` texts already teach. The document regenerates per request; the public doors carry no auth.

## How to re-run

Throwaway worktree from the commit carrying this file, then `node` the probe scripts (kept outside the repo in `/tmp/opencode/openapi-text-probe/` — disposable): a measure script boots `createApp({ registry: {} as never })` and folds `app.request('/doc')` into per-bullet metrics; a param-hatch script exercises `.openapi({ param })`/`registerParameter` on a bare `OpenAPIHono`. The proving edits (probe texts in `server.ts`/`management.ts`/`reads.ts`/`wire.ts`, a throwaway `doc31` twin) were measured and then reverted — this file is the branch's only commit.

## Sources

- `node_modules/@hono/zod-openapi@1.6.3/dist/index.d.mts:11-14,129,224-240` and `dist/index.mjs:87-89,186-197,256-265` — `RouteConfig`, `doc`/`doc31`, per-request generation, `createRoute`, `extendZodWithOpenApi` at load, exports.
- `node_modules/@asteasolutions/zod-to-openapi@9.1.0/dist/index.mjs:287-316,332-337,395-404,424-504,1253-1296,1297-1372,1433-1480,1538-1553,1672-1684,1750-1776` and `dist/zod-extensions.d.ts:10-18`, `dist/v3.0/specifics.d.ts` — metadata collection/promotion, cloning, parameter and path generation, ref emission, 3.0 vs 3.1 specifics, webhook omission.
- `node_modules/zod@4.6.7/v4/classic/schemas.js:99-110` (describe/meta clone), `v4/core/registries.js:23-52` (registry + parent-chain inheritance).
- `node_modules/openapi3-ts/dist/model/openapi30.d.ts:81-93,101-114,206-255` vs `openapi31.d.ts:212-266` — OperationObject / BaseParameterObject / SchemaObject key legality.
- `src/modules.private/server/server.ts` (`docOptions`), `management.ts`, `reads.ts`, `wire.ts` — the patterns the probes exercised.
