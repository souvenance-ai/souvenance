# 02 — refs sweep across docs and skills (accuracy, not the phase-5 rewrite)

Status: claimed
Labels: ready-for-agent

Phase 1 renames refs so nothing in the living tree points at the dead name.
The phase-5 public-docs rewrite (English-first README, two launch skills,
quickstart, CONTRIBUTING) is NOT this work — structure stays, refs get fixed.

- [ ] `README.md`: title; every `node bin/memory.js` → `node
      bin/souvenance.js`; npm/mount examples to the new package + binary
      names; `/etc/ai-memory/tokens.env` → `/etc/souvenance/tokens.env`.
      Keep `.ai-memory/memory.db` refs (path convention unchanged).
- [ ] `.agents/skills/ai-memory/SKILL.md`: the CLI-access line (bin file,
      `souvenance` command, `memory` alias); one-line examples and FTS
      examples to `souvenance ...`. KEEP: frontmatter `name: ai-memory`,
      `memory://` scheme refs, `.ai-memory/memory.db` refs.
- [ ] `.agents/skills/setup-memory-convention/SKILL.md`: bin path refs.
- [ ] `AGENTS.md`: `memory finish` → `souvenance finish`. KEEP "the
      `/ai-memory` skill" (skill name until phase 5).
- [ ] `evaluation-plans/evaluation-plan.md`: `BIN=...bin/memory.js` and
      `node bin/memory.js` refs; eval tmpdir prefixes.
- [ ] Test tmpdir prefixes `ai-memory-*` → `souvenance-*` across src/*.test.ts
      + `src/db.ts` doctor snapshot prefix. KEEP domain-noun strings
      (`memory not found`, `memory number ${i}`).
- [ ] `.scratch/` history: UNTOUCHED.
