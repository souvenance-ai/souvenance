# Spec: phase 3 — repo transfer + store-path migration

## Goal

Execute phase 3 of the public-product arc (objective `dcd9d55c`): one coherent
migration of the default store path (decision `de52efb9`) folded into the repo
transfer to `souvenance-ai/souvenance`, before phase 4 (npm publish) — the last
safe moment before strangers install and their data lands under the dead name.

## Decisions in play

- `de52efb9` (Valentin approved 2026-10-21): default store path
  `.ai-memory/memory.db` → `.souvenance/memory.db`. Blast radius, each migrated
  in the same move: the dogfood store, the archive fork (Valentin's backup
  software — his side, coordinate before touching), the VPS systemd unit
  (in-arc migration with rollback).
- Git autonomy directive (e874baef): branches/merges the agent's; pushes touching
  main always asked.
- Phase-1 precedent: `.scratch/` history is untouched by refs sweeps.

## Scope

**IN**

1. Default-path rename in code (`src/db.ts` DEFAULT_DB_PATH + doc comment),
   bin literals (help strings, export default dir), docs (README, CONTEXT.md,
   SKILL.md), `.gitignore` entry.
2. Dogfood store move: `.ai-memory/` → `.souvenance/` in this repo (gitignored;
   mv preserves 0600 perms + WAL sidecars).
3. package.json gains a `repository` field pointing at the post-transfer URL
   (github.com/souvenance-ai/souvenance — GitHub redirects make it valid before
   and correct after).
4. Repo transfer lifaon74/ai-memory → souvenance-ai/souvenance (gh token
   authenticated as lifaon74, scopes repo/read:org — API attempt first, manual
   fallback for Valentin), then `git remote set-url` local.
5. Flip public, gated on scrub verified (phase-2 full-history scan CLEAN; delta
   scan over post-audit commits).
6. VPS systemd-unit migration documented as exact commands with rollback
   (Valentin's side).
7. Archive fork move — coordinate FIRST; it is Valentin's backup software.

**OUT**

- No code-level auto-migration of old paths: no stranger users exist yet — the
  three known stores (dogfood, archive, VPS) are migrated by hand as coherent
  document. Auto-migration would be dead code carrying risk.
- Skill directory rename (`.agents/skills/ai-memory`) stays for phase 5.
- `memory://` scheme, `.scratch/` history, fork semantics — untouched.
- npm publish / docs / landing — phases 4-6.

## Gate

- Suite green (285/285 baseline), typecheck clean.
- Smoke: `--help` shows `.souvenance/memory.db`; `stats`/`doctor` healthy on the
  MOVED dogfood store at the new default path.

## Sequencing

Local work first (01), then the bundle ask to Valentin: the main-push ask
(directive), the archive-fork coordination, and the flip-public go. The
transfer itself is covered by his "go pour la phase 3".
