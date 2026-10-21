## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles; label strings equal role names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Persistent memory

Check directives first: `list --where "metadata->>'$.kind' = 'directive'"`. Directives are strict rules, constraints, and gotchas that must be respected before acting. Then search memory when you need context you don't have — before starting work, when asked a question, or when recalling a prior decision. Store decisions as you make them. Load the `/souvenance` skill for the CLI reference. When you complete a non-trivial task, store a `kind: "summary"` memory before sending your final message. Before any final message or clear/relaunch recommendation, run `souvenance finish` — the closing ritual (doctor gate + session obligations: summary, experience note, dream debt); a relaunch recommendation is valid only once it reports healthy.
