# Spec: `souvenance skill install` — the self-bootstrapping one-liner

Source: decision fb966b07 (option c, Valentin's pick) + the human-first
landing decision f23cf246. The CLI becomes like `gh`: one verb is the
bootstrap gesture. One line installs both skills into the detected
harness(es); the agent reads the setup skill and takes over from there.

## Shape

`souvenance skill install [--target <key>] [--global]`

- Installs BOTH packaged skills (`souvenance`, `souvenance-setup`) as
  `<target>/skills/<name>/SKILL.md`. Each skill is a single SKILL.md file —
  a pure copy, no bundling logic.
- Targets (verified 2026-10-21 against official docs; SKILL.md is portable
  across all three, optional extra files like Codex's openai.yaml are ours
  to omit):
  - `claude`: project `.claude/skills/`, global `~/.claude/skills/`
  - `codex`: project `.codex/skills/`, global `~/.codex/skills/`
  - `opencode`: project `.agents/skills/`, global `~/.agents/skills/`
- Detection BEFORE installation: a harness's own config dir in the project
  (`.claude/`, `.codex/`, `.agents/`) or home (`~/.claude/`, `~/.codex/`,
  `~/.agents/`) marks it as present. No match → install into the open
  standard dir `.agents/skills/` and SAY SO in output (the default is never
  silent).
- `--target <key>` overrides detection; `--global` picks the home dir of the
  detected/selected harness.
- Idempotent: re-install overwrites in place (the installed copy always
  matches the running CLI's release). Output is a JSON report naming every
  written path and whether it replaced an existing copy — the agent reading
  it knows exactly what changed on disk.

## Source of the packaged files

- The npm package ships `skills/` (package.json files whitelist + the build
  step copies them); the verb resolves them relative to the running bin.
- A repo checkout (dev mode) falls back to `<repo>/.agents/skills/` — no
  build step needed locally.

## Non-goals

- No MCP/HTTP parity: installing skills is a local file operation, not a
  store verb (decision fb966b07).
- No uninstall verb, no skill list, no network fetch — the package carries
  exactly the two launch skills; demand grows the surface later.
- No version field ceremony in the installed frontmatter: the copy IS the
  running release.

## Docs

- README quickstart gains the handoff line: `npx @souvenance/cli skill install`
  then "tell your agent to follow the souvenance-setup skill".
- Landing (phase 6) serves the same line as the copy-paste block.

## Gate

Full suite green + typecheck; a real-run smoke in a scratch dir verifying
the copied files parse as valid frontmatter and land in the right dirs.
