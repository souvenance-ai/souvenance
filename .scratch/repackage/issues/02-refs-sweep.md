# 02 — refs sweep across docs and skills (accuracy, not the phase-5 rewrite)

Status: resolved
Labels: ready-for-agent

Phase 1 renames refs so nothing in the living tree points at the dead name.
The phase-5 public-docs rewrite (English-first README, two launch skills,
quickstart, CONTRIBUTING) is NOT this work — structure stays, refs get fixed.

- [x] `README.md`: title; every `node bin/memory.js` → `node
      bin/souvenance.js`; npm/mount examples to the new package + binary
      names; `/etc/ai-memory/tokens.env` → `/etc/souvenance/tokens.env`.
      Keep `.ai-memory/memory.db` refs (path convention unchanged).
- [x] `.agents/skills/ai-memory/SKILL.md`: the CLI-access line (bin file,
      `souvenance` command, `memory` alias); one-line examples and FTS
      examples to `souvenance ...`. KEEP: frontmatter `name: ai-memory`,
      `memory://` scheme refs, `.ai-memory/memory.db` refs.
- [x] `.agents/skills/setup-memory-convention/SKILL.md`: bin path refs.
- [x] `AGENTS.md`: `memory finish` → `souvenance finish`. KEEP "the
      `/ai-memory` skill" (skill name until phase 5).
- [x] `evaluation-plans/evaluation-plan.md`: `BIN=...bin/memory.js` and
      `node bin/memory.js` refs; eval tmpdir prefixes.
- [x] Test tmpdir prefixes `ai-memory-*` → `souvenance-*` across src/*.test.ts
      + `src/db.ts` doctor snapshot prefix. KEEP domain-noun strings
      (`memory not found`, `memory number ${i}`).
- [x] `.scratch/` history: UNTOUCHED.
- [x] Extra (found during the sweep): `CONTEXT.md` `` `memory fork` `` /
      `` `memory finish` ``, `docs/adr/0002` `` `memory fork` `` — current
      doctrine, renamed. `memory://` scheme refs untouched everywhere.

## Comments

Resolved in commit 3a63479. README.md turned out to be CRLF — a sed `$`-anchor
silently no-ops on `\r`; the title was fixed with the edit tool (endings
preserved). Remaining `ai-memory` strings in the living tree are all
skill-name references (`.agents/skills/ai-memory`, `/ai-memory` skill, `skill
tool call with name ai-memory`) — legitimate until the phase-5 skill rename.
