# The MCP bridge: a stdio client of the wire, env-bound, never a store owner

The legacy MCP surface ran in the trusted zone: same process family as the CLI, direct
`Store` access, and its own comment said so — "stdio is the agent's own process (loopback
equivalent), so no bearer tokens". That posture died twice on this branch: #63 retired the
freestyle loopback operator (every store access carries a token), and #74 made the grant the
address (the data routes carry no store name). The MCP surface lands as the third posture of
the new grammar (#22): a **bridge** — a stdio process whose tools are the data routes, one
HTTP call per call, the server the only store owner (#17).

## The decision

- **A bridge, never a second owner.** The bridge opens no store, touches no filesystem,
  speaks no SQL. Every tool call is one HTTP call carrying the launch-time Bearer; the
  server's grammar is the only judge.
- **One bridge = one grant.** URL and secret are pinned at launch; no per-call store
  selection exists. An agent on two stores mounts two bridges (the multi-store token stays
  on the backlog, #28).
- **The binding rides the environment.** `SOUVENANCE_URL` (optional — the server's own
  loopback defaults are the default) and `SOUVENANCE_TOKEN` (required, refusing with the
  teaching when absent — the echo of #63's zero-credential boot refusal at the bridge's own
  door). Research against primary sources (2026-11-06, recorded on #22): the MCP spec
  governs the wire, not client config, and the ecosystem's standard for stdio secrets is
  the client's per-server `env` block; the working directory is unreliable across clients
  (the official debugging doc warns; Claude Desktop, Windsurf, Cline, Codex Desktop spawn
  with cwd `/` or `$HOME`), so a project-directory file is never a discovery mechanism; a
  token never rides argv (ps, /proc, consent dialogs). The dev's per-directory story is
  carried by the clients' own project configs, which carry the env block.
- **The mirror rule re-anchored on the wire.** Tool names are the route verbs, tool
  arguments are the wire's field names, results are what the routes serve verbatim, and
  every refusal arrives as a tool-level `isError` carrying the envelope's message — an
  unknown authored key rides to the wire and refuses by name (#60's posture held at the
  bridge: a silently-dropped field is a lie). JSON-RPC protocol errors stay protocol-only.
- **Liveness before speaking.** The bridge probes `GET /healthz` at open and refuses to
  speak when the server is absent; a server that dies mid-session answers tool calls with
  the reachability teaching — never a protocol crash.
- **Thirteen tools, not the legacy's seventeen.** Twelve data verbs plus the `skills`
  orientation door. The legacy's `update`, `delete`, `relations`, `tags`, `stats` and
  `doctor` stay dead (their verdicts are registered); `recover`/`finish` live again as
  `checkin`/`checkout`.
- **The protocol subset stays hand-rolled** (#16's verdict stands for 0.2.x stdio): the
  needed subset is small and stable, and the SDK earns its weight only when MCP over HTTP
  becomes imminent.

## Considered options

- **Keep the v0.1 posture: direct store access, no tokens** — rejected: the loopback trust
  it leaned on is retired (#63), and a second store owner re-opens every arbitration door
  the ownership lock closes (#17).
- **A project-directory binding file read from the working directory** — rejected as the
  primary mechanism: the cwd of a stdio subprocess is not a reliable project-directory
  signal across clients; an absolute-path binding file remains an additive backlog idea if
  a real need appears.
- **The token in argv** (`souv mcp --token …`) — rejected for the secret: argv is
  world-readable via ps and echoed verbatim in client consent dialogs. The base URL in
  argv is acceptable and remains #49's to grill.
- **Adopt the official SDK now** — rejected for 0.2.x per #16: a stdio-only bridge gains
  nothing from the HTTP/auth transport weight; re-judge when HTTP MCP is imminent.

## Consequences

- The env names are a public contract: they are what every user writes into an MCP client's
  config; renames are breaking. The `souv mcp` command — flags over env, the exit code for
  the binding refusal — is #49's composition; the module is purely programmatic.
- The token never crosses the agent's session: the bridge signs every call, and the waking
  skill teaches the split (HTTP: the agent carries URL + grant; MCP: the bridge carries
  both).
- `instructions` stays a short static ritual (checkin first, one-gesture authoring,
  immutability, checkout before ending) plus the pointer to the `skills` tool — the deep
  posture is server-owned, served verbatim from the skills directory, never duplicated in
  the bridge.
- The adversarial battery (probes/run) can grow an MCP phase later: spawn the bridge as a
  real subprocess with its env and speak JSON-RPC line by line; nothing in this design
  blocks it.
