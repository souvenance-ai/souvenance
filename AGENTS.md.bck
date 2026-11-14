## Language

- Work, think, and produce only English content: PRs, commits, files, code, docs, issues.
- Converse with the user in the user's language.

## Code layout

User preferences for TypeScript code organization — apply them to new code and preserve them when touching existing code:

- File and folder names are dash-cased: `with-busy-retry/with-busy-retry.ts`. Dots are also accepted for test files (`store.reads.test.ts`).
- One `.ts` file per folder. Name the folder after its file: `serve/serve.ts` + `serve/serve.test.ts`.
- Colocate tests with the code they cover: the test file sits next to its source file.
- Each file exposes, when possible, a single public export (one function or class). Related types may be exported alongside the function/class they describe.
- No barrel files: do not create `index.ts` re-export modules.
- No default exports: use named exports only.

## Code style

User preferences for TypeScript naming and typing — apply them to new code and preserve them when touching existing code:

- No abbreviations in variable names — spell names out. The only exceptions are universally standard ones (`for (let i = ...)`).
- No `private` keyword on methods or properties: use private fields (`#myMethod`) instead.
- Every TypeScript generic follows the pattern `G` + PascalCase name (`GResult`), never single letters.
- Use `readonly` as much as possible in types and interfaces.

## Waiting

- Prefer watching over sleeping: wait on the event you actually care about (file watcher, readiness check, process exit, completion signal) instead of a timed delay.
- When there is no alternative to `sleep`, keep it as short as the task allows — cap it at 10 seconds when possible.

## Pull requests

The agent's PR routine, in order — each step completes before the next:

1. **Review before PR**: run the `code-review` skill on the change (two axes: Standards, Spec), then fix what must be fixed and decline the rest with a recorded reason. A PR opens only after its findings are resolved.
2. **Open the PR** on the agreed base branch.
3. **Request the Copilot code review** on the PR, and wait for the review to come back.
4. **Process Copilot's comments through a subagent**: each comment is judged — legitimate ones land as fix commits on the PR, the declined ones get a recorded reason (as PR comments).
5. **Ask the user to review and merge.** The merge is always the user's gesture; the agent merges only when the user explicitly asks for it.

## Agent skills

### Issue tracker

Issues are tracked on GitHub (souvenance-ai/souvenance) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles with their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
