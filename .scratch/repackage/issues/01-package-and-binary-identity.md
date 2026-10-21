# 01 — package.json + binary file identity

Status: resolved
Labels: ready-for-agent

Rename the package and the executable surface to the charted souvenance
identity.

- [x] `package.json`: `name` → `@souvenance/cli`; `bin` →
      `{"souvenance": "bin/souvenance.js", "memory": "bin/souvenance.js"}`
      (`memory` = transition alias, charted).
- [x] `git mv bin/memory.js bin/souvenance.js`.
- [x] HELP text: `Usage: souvenance ...`; the fork note's example command; the
      OpenCode mount line (`opencode mcp add souvenance -- node
      <path>/bin/souvenance.js mcp`); the serve startup line
      (`souvenance server listening on ...`).
- [x] `src/mcp.ts`: `SERVER_NAME = "souvenance"`; INSTRUCTIONS lead
      `souvenance: a persistent...`; `` `souvenance mcp` `` in the header
      comment.
- [x] `src/server.ts`: root route `name: "souvenance"` (both local and token
      mode); `` `souvenance serve` `` and `bin/souvenance.js` in comments.
- [x] Tests asserting the old names: `mcp.test.ts` serverInfo.name (×2),
      `server.test.ts` root `json.name`; `mcp.test.ts` bin URL;
      `db.openrace.test.ts` execFileSync path.
- [x] `.ai-memory/...` default-path strings in HELP: UNCHANGED (see spec,
      decision 1).

## Comments

Resolved in commit 3a63479. Two extra refs surfaced by the suite (constructed
paths, invisible to literal grep): `integration.test.ts:117` and
`concurrency.test.ts:13` — `join(process.cwd(), "bin", "memory.js")` →
`"souvenance.js"`. Gate: typecheck clean, suite 275/275.
