# CLI entry and commands

Type: task
Status: open
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
