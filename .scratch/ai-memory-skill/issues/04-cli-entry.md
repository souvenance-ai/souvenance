# CLI entry and commands

Type: task
Status: resolved
Blocked by: 02, 03

## Question

Implement the CLI entry point in `bin/` that maps bash invocations to library operations.

**Scope:**

1. **Entry script** (`bin/memory.js`, executable, shebang `#!/usr/bin/env node`): parse `argv` into subcommand + args + flags. Exit non-zero on error, print a human/agent-readable message to stderr.

2. **Commands**, mapping to the library:
   - `memory store <content> [--metadata <json-string>]` → `store`, prints the new `id` to stdout.
   - `memory update <id> [--content <text>] [--metadata <json-string>]` → `update`.
   - `memory delete <id>` → `delete`.
   - `memory link <from-id> <to-id> --kind <relation> [--metadata <json-string>]` → `link`.
   - `memory search <query> [--where <json-path-filter>] [--limit N]` → `search`, prints results as JSON lines or a table (pick one and document).
   - `memory get <id>` → `get`, prints the memory as JSON.
   - `memory list [--where <json-path-filter>] [--limit N] [--offset N]` → `list`.
   - `memory relations <id> [--direction out|in|both]` → `relations`.
   - `memory stats` → `stats`.

3. **Output format**: stdout is for results (JSON, one document per command), stderr is for errors. Non-zero exit on any failure so the agent can react programmatically.

4. **Path resolution**: the DB path defaults to `.ai-memory/memory.db` in the current working directory. Support a `--db <path>` override flag for testing.

**Acceptance**: every library operation is reachable from the CLI. Inputs are parsed and validated; errors exit non-zero with a message; successes print JSON to stdout. Smoke-test each command end-to-end via `node bin/memory.js ...`.

## Answer

Done. `bin/memory.js` (plain JS, executable, `#!/usr/bin/env node`).

**What was built:**

- **Entry script** (`bin/memory.js`): parses `argv` into subcommand + positional args + `--flag value` pairs via a small `parseArgs` helper. `--db <path>` overrides the store path. `--help`/`-h` prints usage. Unknown commands exit 1 with the help text on stderr.

- **Commands**, all mapping to `Store` methods:
  - `store <content> [--metadata <json>]` → `store.store()`, prints the new `id` to stdout (bare string, one line — easy for agents to capture).
  - `update <id> [--content <text>] [--metadata <json>]` → `store.update()`, prints `updated`.
  - `delete <id>` → `store.delete()`, prints `deleted`.
  - `link <from-id> <to-id> --kind <kind> [--metadata <json>]` → `store.link()`, prints `linked`.
  - `search <query> [--where <sql>] [--limit N]` → `store.search()`, prints `SearchResult[]` as a pretty-printed JSON document (chose JSON over JSON-lines/tables: one parseable document per command is the simplest contract for an agent consumer).
  - `get <id>` → `store.get()`, prints the memory as JSON. Prints `not found: <id>` to stderr and exits 1 for unknown ids (matches the library's `null`-on-unknown contract — missing memories are surfaced, not thrown).
  - `list [--where <sql>] [--limit N] [--offset N]` → `store.list()`, prints `Memory[]` as JSON.
  - `relations <id> [--direction out|in|both]` → `store.relations()`, prints `Relation[]` as JSON.
  - `stats` → `store.stats()`, prints the `Stats` object as JSON.

- **Output format**: stdout for results (JSON, pretty-printed with 2-space indent); stderr for errors (`error: <message>`); exit 0 on success, exit 1 on any failure. `store`/`update`/`delete`/`link` print a one-word confirmation; the rest print JSON.

- **Path resolution**: defaults to `.ai-memory/memory.db` (via `Store.open()`); `--db <path>` override passes through to `Store.open({ dbPath })`.

- **Metadata parsing**: `--metadata` accepts a JSON string; invalid JSON exits 1 with a clear message.

**Design decisions:**
- Plain JS (not `.ts`): the CLI is a thin shell over the library. Node 24 strips types on `.ts` import, so `bin/memory.js` imports `../src/db.ts` directly — no build step, no `--experimental-strip-types` flag needed at runtime.
- `get` on unknown id prints to stderr + exits 1 (rather than printing `null` to stdout): agents checking `exit` code get a clean signal; the `null`-returning library contract is preserved internally.
- `search` query is the join of all positional args after `search` (so multi-word queries work without quoting: `memory search warm cats`).

**Verification:**
- `yarn typecheck`: clean (0 errors).
- `yarn test`: 51/51 pass (unchanged; CLI has no unit tests, smoke-tested manually).
- Smoke-tested all 14 paths end-to-end against a temp DB: store×3, link, search (ranked), get (found + unknown), list (with `--where`), relations, stats, update, delete (cascade verified), help, unknown command. Plus 6 error paths: empty content, update unknown, delete unknown, link missing `--kind`, link unknown target, invalid metadata JSON — all exit 1 with clear stderr messages.

**Facts later tickets depend on:**
- The CLI is `bin/memory.js`, executable, plain JS importing `../src/db.ts`. Run via `node bin/memory.js <command> ...` or `memory <command> ...` (the `bin` entry in `package.json`).
- `--db <path>` overrides the store location for testing.
- Output contract: JSON results on stdout (pretty-printed), `error: <msg>` on stderr, exit 1 on failure. `store` prints the bare id; `update`/`delete`/`link` print a one-word confirmation.
- `--metadata` takes a JSON string; `--where` takes a raw SQL fragment on the `metadata` JSON column (e.g. `metadata->>'$.kind' = 'note'`).
- `get` on unknown id: stderr `not found: <id>`, exit 1.
