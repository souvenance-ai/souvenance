# Harness skill formats for installable skills

Research for issue #77 ("Harness skill formats for installable skills").

Question: what do common agent harnesses require of an installable skill file, so a skill body served by souvenance at `GET /skills/{name}` is copyable into a project without transformation?

Date: 2026-11-03. Method: primary documentation only (official docs of the Agent Skills standard and of Claude Code, OpenCode, Cursor, GitHub Copilot, OpenAI Codex). Divergences are flagged explicitly.

## TL;DR

- Every mainstream harness has converged on the **Agent Skills open standard** (agentskills.io, originally developed by Anthropic): one skill = one folder containing `SKILL.md` (YAML frontmatter + Markdown body), optional `scripts/`, `references/`, `assets/`.
- A served body that is **one `SKILL.md` with frontmatter limited to `name` + `description`**, where `name` is lowercase-`a-z0-9`-with-single-hyphens, ≤ 64 chars, and **equals the install directory name** (i.e. the `{name}` in `GET /skills/{name}`), is copy-paste installable in all five harnesses without any file transformation.
- The divergence between harnesses is **where the folder goes** (`.claude/skills/`, `.opencode/skills/`, `.cursor/skills/`, `.github/skills/`, `.codex/skills/`, and the emerging harness-neutral `.agents/skills/`) — never the file format. Claude Code is the one major harness that does not read `.agents/skills/`.
- Keep the body plain Markdown with no harness-only constructs (`!`cmd``, `@`-file refs, `${CLAUDE_*}`) in the canonical served version: other harnesses ignore them at best, and they are inert in cloud contexts.

## The Agent Skills standard (the intersection baseline)

Source: https://agentskills.io/specification and https://agentskills.io

A skill is a directory containing, at minimum, a `SKILL.md` file:

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
└── assets/           # Optional: templates, resources
```

### Frontmatter (the spec)

| Field | Required | Constraints |
| - | - | - |
| `name` | **Yes** | Max 64 characters. Lowercase letters, numbers, hyphens only. Must not start or end with a hyphen. No consecutive hyphens. **Must match the parent directory name.** |
| `description` | **Yes** | Max 1,024 characters. Non-empty. Should describe what the skill does **and** when to use it, with trigger keywords. |
| `license` | No | License name or reference to a bundled license file. |
| `compatibility` | No | Max 500 characters. Environment requirements (intended product, packages, network). |
| `metadata` | No | Arbitrary string-to-string key-value map. |
| `allowed-tools` | No | Space-separated string of pre-approved tools. **Experimental** — support varies between implementations. |

`name` in regex (as OpenCode states it): `^[a-z0-9]+(-[a-z0-9]+)*$`. The spec allows unicode lowercase alphanumerics; staying ASCII `a-z0-9` is the safe intersection.

### Progressive disclosure (the loading model)

1. **Discovery** (~100 tokens): at startup the harness loads only `name` + `description` of every skill.
2. **Activation**: when a task matches, the harness reads the full `SKILL.md` body into context. Spec recommendation: body under 5,000 tokens / 500 lines.
3. **Resources**: `scripts/`, `references/`, `assets/` files load only when needed. Reference them with relative paths from the skill root, one level deep.

The body has **no format restrictions** (plain Markdown). Validation is available via the reference library: `skills-ref validate` (https://github.com/agentskills/agentskills/tree/main/skills-ref).

## Per-harness details

### Claude Code (Anthropic)

Source: https://code.claude.com/docs/en/skills

- **Locations** (folder-per-skill, `<skill-name>/SKILL.md`): project `.claude/skills/`, personal `~/.claude/skills/`, enterprise (managed settings dir), nested `<subdir>/.claude/skills/` (monorepos), `--add-dir` directories, plugins `<plugin>/skills/`. Legacy single-file `.claude/commands/<file>.md` still works and accepts the same frontmatter except `name`/`paths`.
- **Discovery**: walks parent directories from cwd to repo root. Nested skills below the start directory load lazily the first time Claude touches files there. Live change detection: skill directories are watched mid-session.
- **Frontmatter**: **all fields optional; only `description` is recommended.** Frontmatter is read only when the opening `---` is the file's first line; unparseable YAML still loads the skill with no fields; unrecognized fields are ignored silently.
  - Claude Code extensions: `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`, plus spec fields `metadata`, `license`, `compatibility`.
  - `name` is optional — it defaults to the directory name; the directory name also invokes the skill.
  - Name charset refusals: control/zero-width/bidi characters, private-use codepoints, non-plain-space blanks, `<`, `>`. Reserved names: `synced`, `anthropic-skills`.
  - The combined `description` + `when_to_use` text is **truncated at 1,536 characters** in the skill listing; angle brackets render escaped (`&lt;`/`&gt;`).
- **Portability rule (important)**: outside Claude Code — claude.ai skill uploads, the Skills API, `package_skill.py` from anthropics/skills — **only the six spec fields are allowed and extra keys fail with a hard error** (`Unexpected key(s) in SKILL.md frontmatter: ... Allowed properties are: allowed-tools, compatibility, description, license, metadata, name`). Claude Code itself accepts all six spec fields, so spec-conformant frontmatter loads everywhere unchanged.
- **Body**: Claude Code adds dynamic context injection (`` !`command` `` lines), `@`-file references, and `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PROJECT_DIR}` substitution. These do not function in claude.ai chat/API and reach the model as literal text in synced/cloud contexts.
- **What surfaces a skill to the model**: the description is the routing hint Claude sees at startup; a weak description means the skill never triggers. The user can always invoke `/skill-name`.

### OpenCode

Source: https://opencode.ai/docs/skills (last updated 2026-11-02)

- **Locations**: project `.opencode/skills/<name>/SKILL.md`; global `~/.config/opencode/skills/`; **Claude-compatible** `.claude/skills/` (project + `~/.claude/skills/`); **agent-compatible** `.agents/skills/` (project + `~/.agents/skills/`). For project paths it walks up from cwd to the git worktree root.
- **Frontmatter**: `name` (required), `description` (required), `license`, `compatibility`, `metadata` optional. Unknown fields ignored. `name`: 1–64 chars, regex `^[a-z0-9]+(-[a-z0-9]+)*$`, **must match the directory name**. `description`: 1–1,024 chars.
- **Discovery**: skills are listed in the `skill` tool description (`<available_skills>` block with name + description); the agent loads full content on demand via a `skill({ name })` tool call. Access is gated by pattern-based permissions (`allow` / `deny` / `ask`) in `opencode.json`.
- **Troubleshooting notes**: `SKILL.md` must be spelled all-caps; names must be unique across locations; frontmatter must include `name` and `description` or the skill won't show up.

### Cursor

Sources: https://cursor.com/docs/skills, https://cursor.com/help/customization/skills

- **Locations**: project `.agents/skills/` and `.cursor/skills/`; user `~/.agents/skills/` and `~/.cursor/skills/`; nested monorepo subdirectories (e.g. `apps/web/.cursor/skills/`) are auto-scoped to files under that path.
- **Format**: follows the Agent Skills standard — one folder per skill, name taken from the folder containing `SKILL.md`; optional `scripts/`, `references/`, `assets/`. Optional `paths` frontmatter field to scope activation to file globs.
- **Discovery**: progressive disclosure — the agent sees descriptions, decides relevance, and loads the body; manual invocation via `/` in Agent chat. Skills appear in Customize → Skills ("Agent Decides" section).
- **Cloud nuance**: only `~/.cursor/skills/` syncs to Cloud Agents; `.agents/skills/` and unsynced local skills stay local (project-checked-in skills work in cloud workers).

### GitHub Copilot

Sources: https://docs.github.com/en/copilot/concepts/customizations/agent-skills, https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/add-skills, https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills

- **Surfaces**: Copilot app, Copilot CLI, cloud agent + code review on GitHub.com, agent mode in VS Code, Visual Studio, JetBrains.
- **Locations**: project `.github/skills`, `.claude/skills`, or `.agents/skills`; personal `~/.copilot/skills`, `~/.agents/skills`, `~/.claude/skills`. Each skill gets its own subdirectory; **subdirectory names should be lowercase with hyphens for spaces**.
- **Format**: SKILL.md (frontmatter `name`, `description` + Markdown instructions) + optional supplementary files — explicitly the Agent Skills open standard.
- **Discovery**: Copilot decides when to use a skill based on the prompt and the skill's description; when chosen, the `SKILL.md` is injected into context. Guidance: skills for on-demand detail, custom instructions (AGENTS.md) for always-on rules.
- **`gh skill` CLI**: `gh skill install OWNER/REPO SKILL` installs into the correct directory per agent host (`--agent claude-code`, `--scope user|project`), `gh skill publish --fix` validates. Note: `gh skill` writes provenance metadata (source repo, ref, tree SHA) into the skill's `SKILL.md` frontmatter after install — spec-legal since `metadata` is a standard field.

### OpenAI Codex

Sources: https://developers.openai.com/codex/skills, https://developers.openai.com/codex/concepts/customization, https://developers.openai.com/codex/changelog (agent skills shipped 2025-12-19)

- **Format**: follows the agentskills.io spec — folder with required `SKILL.md` ("must include `name` and `description`"), optional `scripts/`, `references/`, `assets/`, plus an **optional Codex-specific `agents/openai.yaml`** (appearance and dependencies).
- **Locations** (docs diverge between pages, noting explicitly): the December 2025 changelog says repo `.codex/skills` + user `~/.codex/skills`; the current customization page says repo skills go in `.agents/skills` and global in `~/.agents/skills`. The harness-neutral `.agents/skills/` is the direction of travel; `.codex/skills` remains documented for per-user/per-repo installs.
- **Discovery**: progressive disclosure with a **10,000-token budget for the initial skills list** (metadata only); when a skill is selected Codex reads the full `SKILL.md`. Invocation: explicit `$skill-name` (or `/skills`), implicit by description match. Symlinked skill folders supported; restart needed to pick up new skills.
- **Distribution stance**: skills are the authoring format; **plugins are the installable distribution unit** for sharing beyond a single repo.

## Cross-harness compatibility: the intersection

### What one served format can target (recommendation for `GET /skills/{name}`)

Serve exactly one `SKILL.md` per skill, copyable without transformation:

1. **First line of the file is `---`** — Claude Code only reads frontmatter if the opening `---` is the file's first line; every other harness expects the same YAML frontmatter block.
2. **Frontmatter contains exactly `name` and `description`** (the two fields required by the spec, OpenCode, and Codex; recommended by Claude Code; used in all Copilot examples). Both are the only fields the whole table agrees on.
3. **`name`: 1–64 chars, lowercase ASCII alphanumeric + single hyphens** (`^[a-z0-9]+(-[a-z0-9]+)*$`), no leading/trailing/consecutive hyphens — and **`name` must equal the install directory name**, which for souvenance means `name` == the `{name}` in `GET /skills/{name}`. This satisfies the spec ("must match the parent directory name") and OpenCode (same rule); Claude Code and Cursor derive the skill's identity from the folder anyway, so a matching `name` is always consistent.
4. **`description`: non-empty, ≤ 1,024 characters** (the strictest documented cap — spec, OpenCode, Codex list). Keep it comfortably under the cap because Claude Code truncates the combined listing text at 1,536 chars and Codex gives the initial skills list a 10k-token budget. Write it as "what it does + when to use it", with trigger phrases — the description is the only thing the model sees at startup, and it is what makes a harness surface the skill.
5. **No harness-only frontmatter in the canonical body.** Extra fields are *ignored* by Claude Code/OpenCode/Codex, but they are a **hard error on claude.ai/Skills API packaging** (`Unexpected key(s) ... Allowed properties are: allowed-tools, compatibility, description, license, metadata, name`) and dead weight elsewhere. Optional spec fields (`license`, `compatibility`, `metadata`) are safe to include if genuinely useful; `allowed-tools` is experimental with varying support.
6. **Body: plain Markdown, ≤ 500 lines** (spec recommendation). Avoid Claude Code dynamic constructs (`` !`cmd` ``, `@`-file refs, `${CLAUDE_*}`) in the canonical version — inert or literal text in other harnesses.
7. **Supporting files are optional and portable**: `scripts/`, `references/`, `assets/` by convention, referenced with relative paths one level deep. A single `SKILL.md` with no siblings is valid everywhere.

### What diverges per harness

| Concern | Divergence |
| - | - |
| Install directory | `.claude/skills/` (Claude Code), `.opencode/skills/` (OpenCode native), `.cursor/skills/` (Cursor native), `.github/skills/` (Copilot native), `.codex/skills/` (Codex native). The neutral `.agents/skills/` is read by OpenCode, Cursor, Copilot, and current Codex docs — **but not by Claude Code**, so a one-directory-fits-all install does not exist. |
| `name` required? | Required by spec/OpenCode/Codex; optional in Claude Code (falls back to directory name). Including it always is strictly safe. |
| Description cap | Spec 1,024 chars; Claude Code listing cap 1,536 chars combined with `when_to_use`; Codex 10k-token list budget. Serving ≤ 1,024 chars satisfies all. |
| Extra frontmatter | Ignored (Claude Code, OpenCode, Codex) vs hard packaging error (claude.ai/Skills API). |
| Body features | Claude Code-only: `!` shell injection, `@` file refs, `${CLAUDE_SKILL_DIR}`/`${CLAUDE_PROJECT_DIR}`, `context: fork` subagents, `hooks`, `paths` (Cursor also supports `paths`). Everything else: plain Markdown. |
| Layout | Directory + `SKILL.md` is universal. Single-file variants exist per harness (Cursor SDK flat `<name>.md`, Claude Code `.claude/commands/<file>.md`) but are not the portable form. |
| Harness-specific extras | Codex optional `agents/openai.yaml`; `gh skill` adds provenance `metadata` post-install; Copilot Studio packages skills as ZIP (SKILL.md + files). |

### Practical install matrix for a souvenance-served skill

The user downloads `SKILL.md` into a folder named after the skill (`<name>/SKILL.md`) and drops the folder into any of:

| Harness | Directory |
| - | - |
| Claude Code | `.claude/skills/<name>/` |
| OpenCode | `.opencode/skills/<name>/` or `.agents/skills/<name>/` |
| Cursor | `.cursor/skills/<name>/` or `.agents/skills/<name>/` |
| GitHub Copilot | `.github/skills/<name>/` or `.agents/skills/<name>/` |
| Codex | `.codex/skills/<name>/` or `.agents/skills/<name>/` |

No transformation of the file is needed in any case — only the directory choice. If souvenance ships an installer snippet, the lowest-common-denominator default is `.agents/skills/<name>/` with a fallback note for Claude Code (`.claude/skills/<name>/`), or per-harness paths the way `gh skill install --agent` already does.

## Sources

- Agent Skills specification — https://agentskills.io/specification
- Agent Skills overview (origin, progressive disclosure) — https://agentskills.io
- Claude Code skills — https://code.claude.com/docs/en/skills
- OpenCode Agent Skills — https://opencode.ai/docs/skills
- Cursor Agent Skills — https://cursor.com/docs/skills
- GitHub Copilot agent skills (concept) — https://docs.github.com/en/copilot/concepts/customizations/agent-skills
- GitHub Copilot adding agent skills / `gh skill` — https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/add-skills
- OpenAI Codex skills — https://developers.openai.com/codex/skills
- OpenAI Codex customization (skill locations) — https://developers.openai.com/codex/concepts/customization
- OpenAI Codex changelog (skills adoption, 2025-12-19) — https://developers.openai.com/codex/changelog
