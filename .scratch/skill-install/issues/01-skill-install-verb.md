# 01 — implement `souvenance skill install`

Type: task
Status: ready-for-agent
Spec: see `../spec.md`

- Target table with the three verified harness dirs (claude/codex/opencode,
  project + global scopes), detection by each harness's own config dir,
  open-standard fallback spelled out in output.
- Packaging: the npm package ships `skills/` (files whitelist + build-bin /
  tsc-lane copy); checkout fallback resolves `<repo>/.agents/skills/`.
- Idempotent overwrite; JSON report `{installed:[{skill, path, replaced}]}`.
- Tests: detection matrix (each dir present/absent, ambiguous multi-harness,
  explicit --target, --global), overwrite-replaces, checkout fallback paths,
  report shape. CLI contract via the real bin (spawnSync) per bin.wiring
  patterns.
- Docs: README handoff line; SKILL.md gains no guidance of its own (the
  verb's output is the agent-facing contract).

## Resolution

(agent-side work — after the unlink bump merges, rebase carries its own next bump)
