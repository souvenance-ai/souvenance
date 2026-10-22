# Research: official MCP SDK vs the hand-rolled JSON-RPC server

Ticket #16 · researched 2026-10-22 against primary sources (npm registry, SDK repo releases + source, local probes) with local ground truth from `src/legacy/src/mcp.ts`.

## TL;DR — recommendation: **adopt later** (not now, not never)

**Keep the hand-rolled stdio server for 0.2.x. Adopt `@modelcontextprotocol/server` (SDK v2) when the HTTP MCP surface becomes imminent** — that is where the SDK earns its weight (Streamable HTTP, sessions, auth, origin validation). The v1 monolith should not be adopted at all in Oct 2026: it is the SDK team's own maintenance line, and its dependency tree carries a full HTTP/auth stack for a stdio-only server.

- The old rejection recorded in `mcp.ts` (decision ae1259fd: "a new dependency tree (zod et al.)") has gone stale on one leg — zod is already a souvenance dependency (`zod ^4.6.7`, unused in `src/` so far) — but the dependency-tree argument itself got **stronger** against v1 and is now moot for v2 (2 net-new packages).
- v2 fits the repo unusually well: Standard Schema with zod v4 native, node ≥20, clean ESM, typechecks clean under this repo's strict TS 7 config, and `fromJsonSchema` accepts our 17 hand-written JSON Schemas **verbatim** — the migration is mechanical.
- Migration estimate when triggered: **1–1.5 days**, of which ~half is test re-baselining (6–7 of 14 tests).
- Keeping costs nothing today and the surface is finished and proven; the risk is protocol drift on future MCP revisions and re-rolling the hard parts (HTTP transport, auth) when HTTP arrives.

## Ground truth: what the hand-rolled server is

From `src/legacy/src/mcp.ts` (613 lines) and `src/legacy/src/mcp.test.ts` (14 tests, node:test style, vitest conversion pending):

- Newline-delimited JSON-RPC 2.0 over injectable streams (`McpStreams { input, output }`); stdout is protocol-only, human output goes to stderr.
- 17 tools mirroring the CLI verbs 1:1 (`recover, store, supersede, merge, update, link, unlink, deprecate, delete, get, search, list, relations, tags, stats, doctor, finish`), declared as a `TOOLS` array with hand-written JSON Schemas and hand-written arg readers (`optString/optInteger/optWeight/optObject/optBoolean/optRelations`, ~90 lines).
- Protocol: `initialize` (echo the client's `protocolVersion` when it is one of `2024-11-05 / 2025-03-26 / 2025-06-18 / 2025-11-25`, else fall back to **2025-06-18**), `tools/list`, `tools/call`, `ping`; all `notifications/*` silently ignored; unknown methods `-32601`; parse errors `-32700`.
- All tool failures — including argument validation — surface as **tool-level `isError` results**, never JSON-RPC protocol errors.
- A 10 MiB single-line cap: breach → one `-32700` refusal response, session ends.
- `instructions` (the recovery ritual) injected into the client's system prompt at initialize; capabilities advertised as `{ tools: { listChanged: false } }`.
- Header comment records the prior rejection of the SDK (decision ae1259fd).

## The SDK landscape as of 2026-10

The SDK **split in two** in July 2026. This is the single most decision-relevant fact.

| | v1 `@modelcontextprotocol/sdk` | v2 `@modelcontextprotocol/server` (split packages) |
|---|---|---|
| Current | 1.32.1 (2026-10-05) | 2.3.1 (2026-10-05); 2.0.0 stable 2026-07-27, first alpha 2026-04-01 |
| Status | **Maintenance line** — "bug fixes and security updates for at least six months after the v2 release (2026-07-27)" → supported ≥ 2027-01-27; README points users to v2 | Stable line, implements the **2026-07-28 spec** |
| Node | `>=18` | `>=20` |
| Deps | express ^5, hono, jose, ajv, ajv-formats, cors, eventsource(+parser), express-rate-limit, raw-body, content-type, cross-spawn, pkce-challenge, json-schema-typed, zod `^3.25 \|\| ^4`, zod-to-json-schema | **zod `^4.2.0` + `@modelcontextprotocol/core` only**; HTTP transports and auth middleware live in separate opt-in packages (`@modelcontextprotocol/node`, `/express`, `/hono`, `/fastify`) |
| Probe install (with zod 4.6.7, as souvenance pins) | 95 packages, 29 MB `node_modules` (scoped tree 6.3 MB; ajv alone 2.5 MB; zod 8.2 MB, already ours) | server-only: **3 packages** (server, core, zod), 16 MB total of which 8.2 MB is zod we already ship → **net-new ≈ 7.8 MB, 2 packages, 7-line dep tree** |
| Schemas | zod (`ZodRawShapeCompat`) or Standard Schema (`AnySchema` — in the type at `dist/esm/server/mcp.d.ts:161`), zod-to-json-schema → draft-07 | **Standard Schema** — bring zod v4, Valibot, ArkType; exports `fromJsonSchema` for raw JSON Schema; emits draft 2020-12 |
| Protocol versions | `2024-10-07, 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25` (LATEST = 2025-11-25) | same set in `core` (verified in dist), plus 2026-07-28 era handling |
| stdio | `StdioServerTransport`, configurable `maxBufferSize`, **default 10 MB** (`STDIO_DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024`, verified in dist source) | same API from `@modelcontextprotocol/server/stdio`, same 10 MB default, plus silently skipping non-JSON stdout lines (hot-reload tolerance) |

Release cadence: 83 published versions of the v1 package from 2024-11-11 to 2026-10-05 (~3.6/month); the v2 line has had 14 versions in 7 months. The repo is active (269 open issues, 336 PRs at fetch time).

### Breaking-change history — the pattern to price in

Verified highlights, not exhaustive:

- **2.3.0 (2026-10-02):** "one server per request" — `Server.connect()` now rejects with `ALREADY_CONNECTED` while connected; a stateless Streamable HTTP transport handles one request. Broke every HTTP deployment sharing one server instance across requests. (Stdio unaffected: one server per process is the normal shape.)
- **v2 vs v1 behavioral deltas** (from the official migration guide's "re-baselining" list): unknown/disabled tool **calls** now reject with `ProtocolError(-32602)` instead of resolving `{isError: true}`; the `"MCP error <code>: "` message prefix is gone; inbound frames that fail message-shape validation are **dropped with `onerror` and answered with nothing** (hand-written raw-frame test fences hang); `McpServer` advertises `listChanged: true` by default (explicit `listChanged: false` restores the old advertisement); protocol-version pinning became a first-class option (`ProtocolOptions.supportedProtocolVersions`); stdio read buffer got the 10 MB cap where v1 buffered unbounded (v1 1.32.1 carries the cap too, in dist).
- **v1's own history** followed the same pattern: minor releases routinely carried deprecations and transport refactors (the low-level `Server` vs `McpServer` duality, SSE→Streamable HTTP transition, zod v4 support) rather than clean patch flows.

So: both lines evolve, and a minor bump can change wire behavior or test-visible text. Pinning and re-reading release notes is part of the maintenance cost.

## Verified probes (all on node v24.14.0, ESM, zod 4.6.7, repo compiler settings)

Throwaway probe dirs `/tmp/opencode/sdk-probe{,-v2,-v2-min}` — numbers quoted below; dirs are disposable.

1. **Node ≥24 + ESM — clean on both lines.** Both ship ESM builds; probes import from plain `.mjs`/`.ts` with `node`; engines (`>=18`, `>=20`) satisfy souvenance's `>=24`. No Node 24 issues surfaced.
2. **TypeScript — clean on both lines.** Probes typechecked with `typescript@^7.0.2` under a copy of souvenance's `tsconfig.json` (strict, `NodeNext`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedSideEffectImports`, `"type": "module"`): zero errors. (One v2 gotcha: `StdioServerTransport` comes from `@modelcontextprotocol/server/stdio`, not the main entry.)
3. **v1 round trip (InMemoryTransport + SDK Client):** `instructions` pass through initialize; zod 4 schemas convert to draft-07 JSON Schema preserving `integer`/`minimum`/`minItems`; validation failures and unknown tools come back as `isError` tool results with `"MCP error -32602: …"` text — same shape souvenance uses, different message text.
4. **v1 real stdio:** raw JSON-RPC lines piped into `StdioServerTransport` get correct responses; `initialize` echoes a requested `2025-06-18` and `2025-11-25`; an unknown `1999-01-01` falls back to **2025-11-25** — souvenance falls back to `2025-06-18`, a visible wire difference (see below).
5. **v2 round trip:** identical ergonomics; error text without the `MCP error` prefix; JSON Schema draft 2020-12 out.
6. **v2 `fromJsonSchema` — the migration cost killer.** Souvenance's actual `store` tool schema, verbatim, is accepted by `registerTool({ inputSchema: fromJsonSchema(SCHEMA) })`; `tools/list` returns it unchanged (properties byte-for-byte) and validation rejects `weight: 2`, non-array `relations`, missing `content` as `isError` results. **The 17 existing JSON Schemas can move over without translation.**

## Code-shape comparison (one tool)

Current (`mcp.ts`, per tool): JSON Schema in `TOOLS` + a `run(store, args)` body that re-reads and hand-validates every argument through the `opt*` readers.

Adopting v2, per tool:

```ts
server.registerTool(
  "store",
  { description: STORE_DESC, inputSchema: fromJsonSchema(STORE_SCHEMA) }, // or a zod schema
  async (args) => {
    const opts: StoreOptions = {};
    if (args.metadata !== undefined) opts.metadata = args.metadata;
    if (args.weight !== undefined) opts.weight = args.weight;
    if (args.relations !== undefined) opts.relations = args.relations;
    return { id: store.store(args.content, opts) };
  },
);
```

Wiring replaces `runMcpServer` + `handleMessage` (~300 lines) with roughly:

```ts
const server = new McpServer({ name: "souvenance", version: packageVersion() }, {
  instructions: INSTRUCTIONS,
});
/* ...registerTool × 17... */
await server.connect(new StdioServerTransport()); // or (readable, writable) in tests
```

Hand-rolled total today: ~613 lines, zero deps beyond the repo's own. v2 path: ~40 lines of protocol wiring + 17 registrations whose handlers keep the current `run` bodies; the ~90 lines of `opt*` readers die (zod/JSON-Schema validation replaces them) and the ~300 lines of transport/dispatch die.

## What breaks in the tests, either way

**Keep (recommended for now):** nothing in `mcp.test.ts` changes because of this decision. (The node:test → vitest conversion happens regardless and touches all files equally.)

**Adopt v2:** tool-behavior tests (store/get/search/list roundtrip, lifecycle, recover, relations, tags/stats/doctor, bin wiring) pass with the same `call()` driving style — the wire shape (`content[0].text` JSON, `isError`) is unchanged. These need re-baselining:

1. capabilities `deepEqual { tools: { listChanged: false } }` — v2 advertises `listChanged: true` unless set explicitly (a one-line fix in server options, then the test holds);
2. fallback protocol version `2025-06-18` — both SDK lines answer `2025-11-25`; either accept the newer fallback or pin `supportedProtocolVersions`;
3. the validation-message test (8 exact regexes like `'limit' must be an integer`) — zod/JSON-Schema messages differ;
4. the relations malformed-shape assertions (`/must be an array/`) — same cause;
5. the unknown-tool text (`/unknown tool 'nosuch'/`) — SDK text differs;
6. the parse-error/invalid-request protocol fence — v2 drops (or throws on) non-JSON/schema-invalid lines instead of answering `-32700`/`-32600`; the fence must be rewritten around the SDK's semantics;
7. the 10 MiB cap test — SDK behavior is `onerror` + connection close rather than one `-32700` refusal line (cap value matches exactly, so only the observable response changes).

Roughly 6–7 of 14 tests — about half the migration effort. The bin-wiring test (real process, raw JSON-RPC) should survive unchanged; verify the exit-code-0-on-stdin-end expectation at migration time.

## Maintenance cadence and dependency cost, priced

- **v1 adoption is buying a sunsetting package**: maintenance line, EOL-ish ≥ 2027-01-27, README redirects to v2, and every install pulls express/jose/ajv/etc. even for stdio-only use (95 packages / 29 MB probe-measured). Not a real option for a new consumer.
- **v2 adoption is cheap in dependencies** (2 net-new packages ≈ 7.8 MB) and the package most aligned with the repo's zod 4 — but it is 12 weeks past 2.0.0-stable, shipped a deployment-breaking behavioral fix as recently as 2.3.0, and is mid-flight on 2026-07-28-era plumbing (tasks, response caching, per-request servers) that a stdio memory server does not need.
- **Keeping is free and the surface is done.** The hand-rolled code already handles all four live protocol revisions, matches the SDK's 10 MiB cap, uses the same isError semantics, and is exercised end-to-end over the real binary by tests. Protocol drift is the only ongoing cost: each new MCP revision is a constants-plus-behavior hand-merge, which is exactly what the repo has practiced so far (2025-11-25 is in the known set).

## Recommendation

**Adopt later, on a trigger — decision trigger, not a date:**

- **Trigger 1 (primary): MCP over HTTP.** When souvenance's server exposes MCP over Streamable HTTP (the ticket's stated future), hand-rolling sessions/SSE-resumability/bearer-auth/origin-validation is the wrong trade — adopt `@modelcontextprotocol/server` (+ `@modelcontextprotocol/node` middleware) then, serving both stdio and HTTP from one registered-tool set.
- **Trigger 2:** a need for resources/prompts/elicitation/progress or another SDK-native capability.
- **Trigger 3:** a protocol revision whose behavior changes more than a constants merge (or when the 2026-07-28-era features become expected by clients).
- Until then: no change to `mcp.ts`; optionally flip `PROTOCOL_VERSION` fallback from `2025-06-18` to `2025-11-25` (one-line change, independent of this decision, matches what both SDK lines do and what the known-set already contains).
- If adopting v2 must happen today (e.g. to unify code paths early): budget **1–1.5 days**, keep the existing JSON Schemas via `fromJsonSchema`, set `listChanged: false` explicitly and pin `supportedProtocolVersions` to preserve today's negotiation, and re-baseline the 6–7 tests listed above. Do **not** adopt v1.

## Sources

- npm registry: [`@modelcontextprotocol/sdk`](https://registry.npmjs.org/@modelcontextprotocol/sdk) (dist-tags, versions, per-release timestamps, dependency list, engines), [`@modelcontextprotocol/server`](https://registry.npmjs.org/@modelcontextprotocol/server) (same fields).
- SDK repo releases: [v2.3.1 / 1.32.1 / 2.3.0 release notes](https://github.com/modelcontextprotocol/typescript-sdk/releases) (one-server-per-request break, upgrade notes, package table).
- SDK README (main): v1.x maintenance policy (≥6 months after 2026-07-27), package split, Standard Schema statement, stdio example.
- Official migration guide, behavioral-changes reference: `skills/mcp-typescript-sdk-upgrade-to-v2/references/behavioral-changes.md` on `modelcontextprotocol/typescript-sdk@main`.
- SDK dist source (local probe installs): `SUPPORTED_PROTOCOL_VERSIONS`, `LATEST_PROTOCOL_VERSION`, `STDIO_DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024`, v1 `registerTool` type signature.
- Local probes on node v24.14.0: `/tmp/opencode/sdk-probe/probe-v1.mjs`, `probe-v1-stdio.mjs`, `probe-v1.ts`; `/tmp/opencode/sdk-probe-v2/probe-v2.mjs`, `probe-v2.ts`; `/tmp/opencode/sdk-probe-v2-min/probe-fromjson.mjs` (throwaway; outputs quoted in this doc).
- Repo ground truth: `src/legacy/src/mcp.ts`, `src/legacy/src/mcp.test.ts`, `package.json`, `tsconfig.json`.
