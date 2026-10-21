# 01 — store-path default + dogfood move

Status: resolved
Type: task

Rename the default store path `.ai-memory/memory.db` → `.souvenance/memory.db`
(decision `de52efb9`) and move the dogfood store in the same move.

## Checklist

- [x] `src/db.ts`: `DEFAULT_DB_PATH` value + doc comment on the override option.
- [x] `bin/souvenance.js`: three help-string literals (lines 50, 51, 86) +
  the export default dir `.ai-memory/export` (line 384) → `.souvenance/export`.
- [x] `README.md`: 5 literal refs (conventions, --db default, serve example,
  alice mount example, serve options doc).
- [x] `CONTEXT.md`: glossary Store entry.
- [x] `.agents/skills/ai-memory/SKILL.md`: CLI section + Conventions section.
- [x] `.gitignore`: `.ai-memory/` → `.souvenance/`.
- [x] Dogfood move: `mv .ai-memory .souvenance` (permits 0600 + WAL sidecars
  preserved by mv; no other process holds the store).
- [x] Gate: suite green, typecheck clean, smoke (`--help` shows the new path;
  `stats` + `doctor` healthy on the moved store at the new default).

## Resolution

DONE (2026-10-21, branch store-path-migration).
- 16 spots renamed across 7 files: src/db.ts 2, bin 4 (2 help + export help +
  export default dir), README 5, CONTEXT.md 1, SKILL.md 2, .gitignore 1.
  package.json repository field deferred to ticket 04 (post-transfer URL).
- Residual grep clean outside `.scratch/` (historical refs untouched per
  phase-1 precedent); antisélection verified against .scratch/repackage.
- Dogfood move: `mv .ai-memory .souvenance` — memory.db 0600 (984K) preserved;
  NO sidecars present at move time (checkpointed at last close), NO export dir.
- SURPRISE: `archive.db` (816K, 0644) lived in THIS repo dir — the blast radius
  is here, not on a remote machine; ticket 02 reframed accordingly.
- Gate: suite 285/285, typecheck clean, smoke green (help shows the new path
  ×2; doctor healthy — 11 checks, file_permissions green on the moved store:
  166 memories, 464 edges).
