# Repackage — phase 1 of the public-product arc

Source: the charted objective (souvenance public product), phase 1 — "rename
package.json/bin/refs to souvenance identities; yarn 4 kept, NO workspace;
typecheck + full suite green". Valentin delegated the go ("fais ce qui te
semble le plus pertinent", 2026-10-21). Phases 2-6 (audit, repo transfer, npm
publish, public docs, landing) remain gated on his explicit acts.

## Identity (from the charted decisions)

- Package: `@souvenance/cli` (npm scope owned by Valentin).
- Binary: `souvenance`; `memory` kept as a transition alias in the `bin` field.
- Entry file: `bin/memory.js` → `bin/souvenance.js` (git mv).

## Execution decisions (the grilling never visited these branches)

1. **Default store path `.ai-memory/memory.db` UNCHANGED this phase.**
   `DEFAULT_DB_PATH` (src/db.ts:30) is the single source of truth. Renaming it
   is data migration beyond the charted "package.json/bin/refs" scope, with a
   blast radius the chart reserves for later phases: the dogfood store itself,
   the archive fork `.ai-memory/archive.db` (Valentin's backup-software
   subject), and the VPS systemd unit (in-arc migration with rollback
   documented). OPEN QUESTION for Valentin, with recommendation: rename to
   `.souvenance/memory.db` BEFORE phase 4 (npm publish) — the last safe moment
   is before strangers install and their data lands under the dead name; the
   ideal moment is phase 3 (repo transfer), as one coherent migration.
2. **The `memory://` URI scheme stays.** It is baked into every stored
   memory's content across every store; changing it would rewrite lived
   history (the addition-only model forbids it). A renamed product keeps its
   link scheme — the scheme is a data format, not a brand.
3. **The skill dir/name stays until phase 5.** `.agents/skills/ai-memory/`
   with frontmatter `name: ai-memory` (chart: "the current daily-use skill
   renamed to product identity" at launch). Only its REFS are updated this
   phase (bin path, command examples) so the next recovery ritual runs the
   live binary.
4. **Identity strings in code:** MCP `SERVER_NAME` → `souvenance`; HTTP root
   route `name` → `souvenance`; the MCP mount suggestion → `souvenance`.
5. **`.scratch/` history untouched** — past arcs' process docs record what
   was true then; this directory is the only new one.
6. **Tmpdir prefixes in tests** (`ai-memory-*-test-`) renamed to
   `souvenance-*` — current code, cheap coherence, suite-gated. Domain nouns
   stay (`memory not found: <id>` errors — "memory" is the domain term, not
   the product name).

## Gate

`yarn typecheck` + full test suite green. Working tree on branch
`repackage-souvenance`, ff-only merge to main; push to origin/main only after
Valentin's approval (git-autonomy directive).
