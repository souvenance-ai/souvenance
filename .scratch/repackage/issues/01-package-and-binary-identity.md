# 01 — package.json + binary file identity

Status: claimed
Labels: ready-for-agent

Rename the package and the executable surface to the charted souvenance
identity.

- [ ] `package.json`: `name` → `@souvenance/cli`; `bin` →
      `{"souvenance": "bin/souvenance.js", "memory": "bin/souvenance.js"}`
      (`memory` = transition alias, charted).
- [ ] `git mv bin/memory.js bin/souvenance.js`.
- [ ] HELP text: `Usage: souvenance ...`; the fork note's example command; the
      OpenCode mount line (`opencode mcp add souvenance -- node
      <path>/bin/souvenance.js mcp`); the serve startup line
      (`souvenance server listening on ...`).
- [ ] `src/mcp.ts`: `SERVER_NAME = "souvenance"`; INSTRUCTIONS lead
      `souvenance: a persistent...`; `` `souvenance mcp` `` in the header
      comment.
- [ ] `src/server.ts`: root route `name: "souvenance"` (both local and token
      mode); `` `souvenance serve` `` and `bin/souvenance.js` in comments.
- [ ] Tests asserting the old names: `mcp.test.ts` serverInfo.name (×2),
      `server.test.ts` root `json.name`; `mcp.test.ts` bin URL;
      `db.openrace.test.ts` execFileSync path.
- [ ] `.ai-memory/...` default-path strings in HELP: UNCHANGED (see spec,
      decision 1).
