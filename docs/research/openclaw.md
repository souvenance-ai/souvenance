# Research: openclaw — what to borrow for the manager CLI + agent-facing server

Ticket: [#14 "Research: openclaw — what to borrow for manager CLI + agent-facing server"](https://github.com/souvenance-ai/souvenance/issues/14)
Date: 2026-10-22 · Branch: `research/openclaw`

**Context.** souvenance v0.2.0 refocuses the product "similar to openclaw": a CLI
that launches and manages the server (config, lifecycle, proxy for memory ops)
and a server that is the full agent-facing surface (store/retrieve memories,
manage stores — create/fork), with v0.1.x parity (`recover store supersede
deprecate merge update delete link unlink search get list relations stats tags
export fork doctor finish mcp serve`).

Primary sources (fetched 2026-10-22; stable release `2026.8.1`):

- Repo: <https://github.com/openclaw/openclaw> (TS/Node, pnpm monorepo, MIT)
- Docs: <https://docs.openclaw.ai> — `/cli`, `/cli/gateway`, `/cli/gateway/running`,
  `/cli/gateway/query`, `/cli/memory`, `/cli/mcp`, `/gateway`,
  `/gateway/configuration`, `/gateway/protocol`, `/gateway/protocol/handshake`,
  `/gateway/protocol/auth`, `/gateway/clients`, `/gateway/tools-invoke-http-api`,
  `/concepts/architecture`

---

## 1. What openclaw is

OpenClaw (formerly **Clawdbot → Moltbot → OpenClaw**, by Peter Steinberger, now
stewarded by the OpenClaw Foundation, a 501(c)(3)) is an open-source,
self-hosted AI **assistant gateway** written in TypeScript/Node. It runs one
always-on local process — the **Gateway** — that connects messaging channels
(WhatsApp, Telegram, Slack, Discord, iMessage, …), hosts the agent loop, tools,
skills, memory, and cron, and serves operator clients (CLI, TUI, macOS/iOS/
Android apps, a browser Control UI). ~393k stars / 117k commits at time of
research. Everything (state, memory, credentials) lives on the user's machine;
nothing is hosted.

## 2. Architecture in one picture

```
                    ┌────────────────────────── one host ──────────────────────────┐
                    │                                                              │
 channels ──────────┤  GATEWAY (single always-on Node process, port 18789)          │
 (WhatsApp/TG/…)    │  ├─ WS control plane / RPC          (operator + node roles)  │
                    │  ├─ HTTP APIs  /v1/models /v1/chat/completions /v1/responses │
                    │  │             /v1/embeddings /tools/invoke                  │
 nodes              │  ├─ /healthz  /readyz   plugin routes   Control UI   hooks   │
 (phone/desktop,    │  ├─ channels   sessions   agent loop   tools   skills        │
 role:"node") ──────┤  ├─ memory (memory-core plugin)   cron   scheduler           │
                    │  └─ state: ~/.openclaw/ (config JSON5 + SQLite + workspace)  │
 Control UI/CLI/TUI ┤                                                              │
 (operator, WS) ────┘                                                              │
                    └──────────────────────────────────────────────────────────────┘
```

- **One process, one multiplexed port**: WS control/RPC *and* HTTP APIs *and*
  the browser Control UI share port 18789 (default). `/concepts/architecture`,
  `/gateway`.
- **Roles** at handshake: `operator` (CLI/UI/automation control plane), `node`
  (capability host: camera/screen/canvas/voice), `worker` (separate closed
  protocol for cloud workers). `/gateway/protocol/handshake`.
- **Channel connections, sessions, tools, memory all live in the Gateway.**
  The CLI does *not* implement memory ops locally when the Gateway runs —
  `memory search` routes through the Gateway; most other memory commands
  require the Gateway **stopped** so they own the SQLite file exclusively
  (`/cli/memory`).
- Repo layout: pnpm workspace with `src/` (CLI + gateway core),
  `packages/gateway-protocol` (TypeBox schemas, wire contract),
  `packages/gateway-client` (reference WS client), `packages/terminal-core`,
  `ui/` (Control UI), `extensions/`, plus generated `protocol.schema.json`.

## 3. CLI surface (actual commands, condensed)

`openclaw` has ~60 top-level commands (full tree at `/cli`). Grouped by job:

| Group | Commands |
| --- | --- |
| Setup/onboarding | `openclaw` (TUI), `setup` (also `--baseline` non-interactive), `onboard`, `configure`, `doctor` (audit/repair, `--fix`, `--generate-gateway-token`), `dashboard`, `completion` |
| Config | `config get|set|patch|unset|file|schema|validate` — read/write a value **by path**, print the schema, validate, print the active file path |
| Gateway lifecycle | `gateway run`, `gateway install|uninstall|start|stop|restart|status`, `gateway probe`, `gateway call <method>`, `gateway health`, `gateway usage-cost`, `gateway stability`, `gateway diagnostics export`, `gateway discover` (mDNS), `gateway suspend`, `gateway resume <id>`, `gateway recover-lock`, `gateway auth-token --show` |
| Health/status | `status`, `health`, `triage`, `logs --follow`, `sessions`, `audit` |
| Messaging/agents | `message send|read|react|…`, `agent`, `agents list|add|delete|bind|set-identity`, `attach`, `acp` |
| Memory | `memory status|index|reset|search|forget|promote|promote-explain|rem-harness|rem-backfill|session-backfill` |
| Security | `security audit`, `secrets reload|store|audit|configure|apply`, `approvals`, `exec-policy`, `pairing list|approve`, `devices list|approve|reject|rotate|revoke|remove|clear` |
| Automation | `cron`, `hooks`, `webhooks`, `transcripts list|show|path` |
| Maintenance | `backup create|verify|restore`, `database port` (SQLite⇄Postgres), `migrate`, `reset`, `uninstall`, `update` |
| Plugins/skills | `plugins list|search|install|enable|doctor|…`, `skills search|install|check|…` |
| Legacy alias | `daemon` = the gateway service subcommands (`daemon status/install/start/stop/restart`) |

### CLI conventions worth copying wholesale

- **`--json` reserves stdout for exactly one JSON document**; warnings/diagnostics
  go to stderr. Human output is default in TTYs.
- **Standard JSON failure envelope**: `{"ok":false,"error":{"type":"cli_error","message":"…"}}`
  with exit 1; domain-specific fields sit beside it.
- **Global flags before the command**: `--profile <name>` (state under
  `~/.openclaw-<name>`), `--dev` (under `~/.openclaw-dev`, port 19001),
  `--no-color`, `--log-level`; `--` stops option parsing.
- **Connection failures give a short explanation + the status-check command**
  ("run `openclaw gateway status`"), and `OPENCLAW_DEBUG=1` adds diagnostics.
- **Exit codes are contracts**: exit 78 = invalid configuration (systemd's
  `RestartPreventExitStatus=78` then stops restart-looping); 1 = generic error;
  `gateway status --require-rpc` exits non-zero when the read-RPC proof fails —
  the documented "script acceptance check".

## 4. Gateway lifecycle (foreground / daemon / service)

From `/gateway` (runbook) and `/cli/gateway/running`:

**Foreground (dev):** `openclaw gateway [--port 18789] [--bind loopback] [--verbose]`.
`openclaw gateway run` is the explicit alias. Startup behavior:

- Refuses to start unless `gateway.mode=local` (or `--allow-unconfigured` for
  ad-hoc dev runs).
- Refuses to bind beyond loopback **without auth**: `refusing to bind gateway …
  without auth`.
- Invalid config → **exit 78** (systemd treats it as "do not restart"); config
  read/storage failures → exit 1 (supervision may retry).
- Process title `openclaw-gateway`; a foreground Gateway does **not** die with
  the parent shell (signal it directly, or `exec` from a wrapper).
- `SIGUSR2` = authorized in-process restart; `SIGINT`/`SIGTERM` = stop; graceful
  shutdown emits a `shutdown` event to clients before closing.
- `--force` kills any existing listener on the target port first.
- State-directory **ownership lock**: one Gateway owner per state dir,
  heartbeat-verified; `gateway recover-lock [--confirm <fingerprint>]` for
  crashed owners in other PID namespaces (containers).

**Service (production):** `openclaw gateway install` writes and starts a native
per-user service; `gateway start|stop|restart|status|uninstall` manage it.
Per-OS supervisor: launchd per-user LaunchAgent (`ai.openclaw.gateway` /
`ai.openclaw.<profile>`) on macOS; **systemd user unit**
(`openclaw-gateway[-<profile>].service`, `Restart=always`, needs
`loginctl enable-linger` on headless hosts) on Linux; Windows Scheduled Task
(fallback: Startup-folder launcher). Notes: `gateway restart` is the supported
restart (not stop+start); installed services record the resolved `--port` in
supervisor metadata; changing `gateway.port` requires `doctor --fix` or
`gateway install --force`. External supervisors are supported
(`OPENCLAW_SERVICE_REPAIR_POLICY=external` keeps doctor diagnostic-only).
Service env is explicit (`~/.openclaw/.env` for credentials), not inherited.

**Ops niceties:** `gateway suspend` / `gateway resume <id>` drain active work
for cooperative host freeze/snapshot (lease + blocker list);
`gateway status --deep` scans for competing service installs; doctor audits and
repairs service/config drift.

## 5. Config file layout

From `/gateway/configuration`:

- Path: `~/.openclaw/openclaw.json` — optional **JSON5**; missing file = safe
  defaults. `OPENCLAW_CONFIG_PATH` / `OPENCLAW_STATE_DIR` override; profiles
  isolate everything.
- **Strict schema validation**: unknown keys, bad types, bad values → Gateway
  **refuses to start**. Only root exception: `$schema`. `openclaw config
  schema` prints the authoritative JSON Schema; `config.schema.lookup` returns
  one path-scoped schema node (drill-down for tooling/UIs).
- **Two-bucket rule**: root siblings = infrastructure + cross-agent defaults
  (`gateway`, `channels`, `models`, `plugins`, `mcp`, `commands`,
  `diagnostics`, `update`, `session`, `tools`); `agents.defaults` = agent-loop
  behavior; `agents.entries.<id>` = per-agent overrides.
- **Editing**: interactive (`onboard`/`configure`), CLI one-liners (`config
  get/set/patch/unset`), Control UI form (rendered from the live schema), or
  direct file edit with hot reload.
- **Hot reload**: watcher on the config path; `gateway.reload.mode: "off" |
  "hybrid"` (default) — hot-apply when safe, restart when required. Running
  process serves the in-memory snapshot; successful reload swaps atomically.
- **Write safety**: gateway-owned writes are atomic (rename onto path);
  clobber guards (refuse writes that drop `gateway.mode` or shrink the file
  >50%); `.bak` ring; trusted last-known-good copy restored only by
  `doctor --fix`; rejected payloads saved as `<path>.rejected.<timestamp>`.
- **Secrets**: plain values, `${VAR}` substitution, or SecretRef
  (`env`/`file`/`exec`/`store` providers); `~/.openclaw/.env` for service-run
  credentials; `openclaw secrets apply/reload`.

Key config keys actually used by the docs:

| Key | Meaning |
| --- | --- |
| `gateway.mode` | `local` (must be set; remote is a separate deployment) |
| `gateway.port` | default `18789`; precedence `--port` → `OPENCLAW_GATEWAY_PORT` → config → default |
| `gateway.bind` | `loopback` (default) \| `lan` \| `tailnet` \| `auto` \| `custom` |
| `gateway.auth.mode` | `token` \| `password` \| `trusted-proxy` \| `none` (private ingress only) |
| `gateway.auth.token` / `gateway.auth.password` | shared secrets (or `OPENCLAW_GATEWAY_TOKEN`/`_PASSWORD`) |
| `gateway.auth.allowTailscale`, `gateway.auth.trustedProxy.allowLoopback`, `gateway.auth.rateLimit` | identity modes + failure rate limiting |
| `gateway.reload.mode` | `off` \| `hybrid` hot reload |
| `gateway.tls`, `gateway.publicOrigin`, `gateway.controlUi.allowedOrigins` | remote hardening |
| `gateway.remote.{url,sshTarget,sshIdentity,tlsFingerprint}` | client-side remote gateway + SSH tunnel + TLS pin |
| `gateway.tools.{deny,allow}` | HTTP `/tools/invoke` deny/allow overrides |
| `agents.defaults.workspace`, `agents.entries` | per-agent workspace/config |
| `channels.<id>.*`, `models.providers.<id>`, `plugins.entries.<id>.config`, `mcp.servers.<name>` | channels/providers/plugins/outbound MCP |
| `commands.restart`, `diagnostics.enabled`, `update.checkOnStart` | misc toggles |

Env vars: `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, `OPENCLAW_GATEWAY_PORT`,
`OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN/PASSWORD`,
`OPENCLAW_HANDSHAKE_TIMEOUT_MS`, `OPENCLAW_DEBUG`, `NO_COLOR`, `NODE_COMPILE_CACHE`.

## 6. How clients address the Gateway

**WebSocket is the control plane.** `/gateway/protocol`, `/concepts/architecture`:

1. Server pushes `connect.challenge` (`{nonce, ts}`) — all connects must sign
   the nonce with a device key.
2. Client sends first frame **must** be `connect`: `{minProtocol, maxProtocol:
   4, client: {id, version, platform, mode}, role, scopes, caps, commands,
   permissions, auth: {token|password}, device: {id (keypair fingerprint),
   publicKey, signature, signedAt, nonce}}`. Non-connect first frames are
   hard-closed; connect deadline is 30s total.
3. Server replies `hello-ok`: `{server: {version, connId}, features: {methods,
   events} (discovery list), snapshot: {presence, health, stateVersion,
   uptimeMs}, auth: {deviceToken, role, scopes (live authority)}, policy:
   {maxPayload 25 MiB, maxBufferedBytes 50 MiB, tickIntervalMs 15000,
   attachments ceilings}}`.
4. Then `req {id, method, params}` → `res {id, ok, payload|error}`, plus
   server-push `event {event, payload, seq?}`. **Events are not replayed** — on
   sequence gaps, clients refresh state. Side-effecting methods require
   idempotency keys (short-lived server dedupe). Agent runs are two-stage:
   `accepted` ack → streamed `agent` events → final response.

Wire version is `4` (N-1 window for node clients); TypeBox schemas → JSON
Schema → generated Swift models; `@openclaw/gateway-protocol` +
`@openclaw/gateway-client` are published so third parties build operator
clients (`/gateway/clients`).

**HTTP on the same port** (`/gateway`, `/gateway/tools-invoke-http-api`):

- OpenAI-compatible: `GET /v1/models` (agent-first ids: `openclaw`,
  `openclaw/default`, `openclaw/<agentId>`), `POST /v1/embeddings`,
  `/v1/chat/completions`, `/v1/responses` — lets stock UIs/RAG clients connect.
- `POST /tools/invoke` — invoke a single tool directly with Gateway auth +
  tool policy. Documented as a **full-operator surface**: shared-secret bearer
  = trusted operator (narrow `x-openclaw-scopes` header ignored), with a hard
  deny list of RCE-ish tools (`exec`, `spawn`, `shell`, `fs_write`,
  `apply_patch`, `sessions_send`, `cron`, `gateway`, `nodes`); policy-denied →
  404, blocked → 403, auth-failure rate limit → 429 + `Retry-After`.
- `/healthz` (liveness) vs `/readyz` (readiness: startup sidecars, channels,
  hooks settling; includes event-loop diagnostics). `/api/v1/admin/rpc` exists
  as a default-off plugin route for tooling that cannot use WS.
- Remote access model: prefer Tailscale/VPN, fallback `ssh -N -L`; SSH tunnels
  do **not** bypass gateway auth; optional WS TLS with client cert pinning.

## 7. Auth model

Two cleanly separated auth layers (`/gateway/protocol/auth`,
`/gateway/authentication`):

1. **Gateway connection auth** (who may talk to the gateway):
   - Modes: `token` | `password` | `trusted-proxy` | `none`. The mode selects
     which configured secret is used; the wire field (`auth.token` or
     `auth.password`) can carry either.
   - Non-loopback bind without a valid auth path is refused at startup.
   - **Device identity + pairing**: every WS client presents an Ed25519 device
     identity (`device.id` = public-key fingerprint) and signs the server
     challenge (v3 payload also binds `platform`/`deviceFamily`). New devices
     require pairing approval (`openclaw devices approve <requestId>`); loopback
     can auto-approve; LAN/tailnet connects always need approval. On approval
     the gateway issues a **device token** scoped to role + approved grant
     (`hello-ok.auth.deviceToken`), persisted only over trusted transports
     (loopback or TLS-pinned `wss://`); rotate/revoke via
     `device.token.rotate|revoke`.
   - **Operator scopes** (closed set): `operator.read|write|admin|approvals|
     questions|pairing|talk|talk.secrets`. `hello-ok.auth.scopes` is the live
     authority for the socket; reserved method prefixes (`config.*`,
     `exec.approvals.*`, `wizard.*`, `update.*`) always require
     `operator.admin`.
   - Auth-failure rate limiting (429 + `Retry-After`); structured auth errors
     with recovery hints (`canRetryWithDeviceToken`, `recommendedNextStep`).
2. **Model-provider auth** (who pays the LLM): API keys/OAuth per agent in
   SQLite, SecretRef support, key rotation on rate limits — completely separate
   from gateway auth.

## 8. CLI ↔ server relationship: manager vs proxy vs direct

This is the most directly transferable part. openclaw's CLI commands fall into
**three classes**:

1. **Lifecycle/manager commands** (local): `gateway` (foreground), `gateway
   install/start/stop/restart/status/uninstall`, `doctor`, `config get/set`,
   `reset`, `backup`, `update`. They talk to the OS (service managers), the
   filesystem (config, state), or spawn the server. `gateway status` reads
   service state *and* optionally probes the running gateway.
2. **Proxy commands** (need the server, act as a WS client):
   `gateway call <method> --params '{…}'` is the low-level escape hatch for
   operators/automation; `gateway health/status/probe/stability/usage-cost/
   suspend/resume` and `memory search` all connect to the Gateway over WS with
   shared flags `--url/--port/--token/--password/--timeout` and send ordinary
   RPCs. Notably: **`memory search` routes through the running Gateway** so
   recall recording/session scoping stays centralized.
3. **Direct/offline commands** (must NOT share the store with a running
   server): most `memory` commands (`index`, `reset`, `forget`, `promote`,
   backfill) **refuse to run while the Gateway owns the state directory** —
   stop the server, run the command, restart. Ownership is enforced via the
   state lock, not conventions.

Other explicit CLI↔server design decisions:

- **Fail fast, no fallback**: "Gateway protocol clients fail fast when Gateway
  is unavailable (no implicit direct-channel fallback)." If a proxy command
  can't connect, it says so and points at `openclaw gateway status`.
- `--expect-url <url>` on `gateway call` pins the destination for automation
  safety.
- The CLI *reports* what it proved: `gateway status` proves service state +
  WS connect + handshake-visible auth capability — **not** read/write/admin
  operations; `--require-rpc` upgrades that to a read-scope RPC check.

### MCP story (relevant to souvenance's hand-rolled MCP server)

`openclaw mcp serve` is a **thin bridge**, not a second brain: the MCP client
spawns the stdio bridge, the bridge connects to the Gateway over WS, and
sessions/conversations map onto Gateway state. Tools: `conversations_list`,
`conversation_get`, `messages_read`, `attachments_fetch`, `events_poll`,
`events_wait`, `messages_send`, `permissions_list_open`, `permissions_respond`.
Note the streaming-free design: even events are **polled** (`events_poll`/
`events_wait`) because MCP stdio can't push. A second command family
(`mcp add/set/list/show/status/doctor/probe/tools/login`) is the *outbound*
registry of third-party MCP servers the agent runtime may consume.

## 9. Mapping to souvenance

| openclaw | souvenance v0.2.0 (proposed) |
| --- | --- |
| Gateway (WS, port 18789, channels+agent loop) | `souvenance serve` HTTP server (Hono, port 3141): full agent surface — memory ops, store management (create/fork) |
| operator clients (CLI/TUI/apps, WS) | CLI: `souvenance <verb>` — manager (lifecycle/config) + proxy (memory ops → HTTP) |
| channels/nodes/worker roles | none (v0.2) — single operator audience |
| `~/.openclaw/openclaw.json` (JSON5) | `~/.souvenance/config.json` (or keep `.souvenance/config.json` beside the store) |
| `openclaw config get/set/patch/unset/schema/validate` | same command shapes for the souvenance config |
| `gateway install/start/stop/restart/status` | `souvenance server start|stop|restart|status|install|uninstall` (+ `daemon` alias) |
| `gateway call <method>` | `souvenance call <route-or-op>` escape hatch over HTTP |
| `gateway auth-token --show` | `souvenance server token --show` (TTY-only reveal) |
| memory-core offline/online split | v0.1 CLI verbs: offline commands stay offline; proxy verbs go through the server when it runs |
| `mcp serve` bridge to Gateway | keep hand-rolled MCP stdio server; make it a bridge to the HTTP server (single enforcement point), or document that `mcp` and `serve` are mutually exclusive owners of the store |

## 10. Borrow for v0.2.0 (concrete)

1. **CLI-as-client of the server for memory operations.** The server is the
   single enforcement/auth point. CLI memory verbs proxy to the running server
   (shared `--port/--url/--token/--timeout` flags); offline verbs that need the
   SQLite file (`doctor`, `export`, `fork`, `finish`, compaction) refuse politely
   while the server owns the store — openclaw's exact split. Fail fast with a
   "server not reachable — run `souvenance server status`" hint; never silently
   fall back to direct DB access from proxy verbs.
2. **Lifecycle command set + service supervision.** `serve` (foreground, keep
   port 3141), `server start/stop/restart/status/install/uninstall` mapping to
   launchd (macOS LaunchAgent `ai.souvenance.server`), systemd **user** unit
   (Linux; `Restart=always`, linger note for headless), schtasks (Windows).
   `status` = service state + connectivity + capability line; `--require-rpc`
   as the scriptable acceptance check. `--force` port takeover for dev. A
   state-store **ownership lock** (one owner per DB, heartbeat + PID) with a
   `recover-lock` escape hatch — formalizes the race protection v0.1 already
   tests for.
3. **Config file with strict validation + `config` subcommands.**
   `~/.souvenance/config.json` (JSON is fine; JSON5 optional), safe defaults
   when missing, unknown key = refuse to start, `souvenance config
   get/set/patch/unset/schema/validate/file`, `.bak` ring + last-known-good +
   `doctor --fix` for repairs, clobber guard (refuse writes that shrink the
   file >50% or drop required keys). Keep hot reload out; a manual `server
   restart` is enough for v0.2.
4. **Auth discipline (borrow, cheap).** Refuse non-loopback bind without token
   auth (openclaw's `refusing to bind gateway … without auth`); Bearer for HTTP
   (`souvenance serve` already does scoped agent tokens — keep and document
   them as the auth model); auth-failure rate limiting with 429 + `Retry-After`;
   a TTY-only token reveal command; keep "server auth" (bearer) separate from
   any other credential kind.
5. **Health surfaces + one-document JSON CLI.** `/healthz` (liveness) vs
   `/readyz` (readiness) split; `souvenance status --json` proves service +
   connect + auth capability. Adopt openclaw's CLI output contract verbatim:
   `--json` = exactly one JSON doc on stdout (warnings to stderr), standard
   failure envelope `{"ok":false,"error":{"type","message"}}`, meaningful exit
   codes (78 for invalid config), global flags before the command.
6. **MCP as bridge, not twin server.** Souvenance's MCP stdio server should
   proxy through the HTTP server (or run inside it) so auth/scoping has one
   implementation; openclaw's `mcp serve` proves the bridge pattern works fine
   with polling for events (no WS/WebSocket needed).
7. **Doctor as drift auditor.** Extend v0.1 `doctor --fix` beyond store
   integrity: audit config validity, service definition drift (port/auth/config
   path in the installed service), and offer repairs — openclaw's doctor is
   exactly this and it removes most "why is my server not running" tickets.
8. **Naming the memory-management verbs** after usage like openclaw's memory
   suite: `memory status` (deep/index/fix flags), `index --force` (full
   rebuild), `reset` (clears derived tables only, never the source data), and
   dry-run-first destructive ops (souvenance already has `delete --force`;
   keep the dry-run/report pattern for provenance-sensitive deletions).

## 11. Deliberately left out for now (and why)

- **Channels** (WhatsApp/Telegram/Discord/…): souvenance's audience is agents
  calling an HTTP API, not humans in chat apps. The channel layer is openclaw's
  biggest complexity (credentials, pairing per channel, health probes).
- **WebSocket control plane + subscriptions/events**: souvenance's operations
  are request/response; plain HTTP + polling covers them. openclaw's own MCP
  bridge polls (`events_poll`/`events_wait`) even though it has WS — evidence
  that polling is acceptable for agent-facing surfaces. Revisit only if
  watch/live-update becomes a real need.
- **Device pairing / Ed25519 challenge signing / deviceToken issuance**: a
  single-operator local memory server with scoped bearer tokens doesn't need
  per-device cryptographic identity. Document as a future hardening path if
  multi-device/multi-tenant arrives.
- **Roles/scopes beyond what tokens already carry**: openclaw's operator scope
  set exists because CLI/UI/nodes/automations share one gateway. souvenance
  tokens already carry store + rw + where scoping; keep that, don't add
  `operator.admin`-style layering yet.
- **OpenAI-compatible `/v1/*` endpoints**: souvenance is a memory server, not
  an LLM proxy; `/v1/chat/completions` etc. would blur the product. (The *idea*
  of speaking a ubiquitous dialect for `models`-style discovery is N/A.)
- **Auto-start daemon by default / `--install-daemon` in onboarding**: keep
  foreground `serve` the default; `server install` stays an explicit command
  (matches openclaw, where onboarding asks but the service is one command).
- **TLS + pinning, trusted-proxy identity mode, Tailscale/funnel integration,
  mDNS/Bonjour discovery (`gateway discover`), SSH-tunnel helpers**: remote
  hardening paths for exposed gateways; souvenance is loopback-first in v0.2.
- **Worker/cloud role, nodes (camera/screen/canvas), TUI + Control UI,
  multi-agent `agents.entries`, model-provider auth/rotation, sandbox +
  exec-approval policy engine, cron/hooks/webhooks, plugin/skill ecosystems,
  `$include`/Nix config, suspend/resume host-freeze protocol, Postgres port
  (`database port`), diagnostics-export zip, `logs --follow`** — all exist to
  serve openclaw's assistant/host-agent surface, not a memory store.

## 12. Open questions for v0.2.0 design

- Does the proxy split (online vs offline verbs) force `serve` to lock the DB
  exclusively, or can an offline `doctor` run read-only beside a running
  server (SQLite WAL allows readers)? openclaw chose hard exclusivity for
  writers — worth a deliberate decision, since v0.1 CLI was always offline.
- Should `souvenance server status` keep working with **no** installed service
  (pure process probe)? openclaw treats a missing service as informational and
  still probes connectivity — good behavior to copy.
- Store management (`create`/`fork`) as agent-facing server routes: openclaw
  has no analog (its "fork" concept is workspace-level and operator-side), so
  design freely — the CLI `fork` verb (VACUUM INTO) already defines the
  primitive.
