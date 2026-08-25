# Evaluation Plan: ai-memory Skill

Instructions for an **evaluator agent** that tests whether a sub-agent can use the `/ai-memory` skill to maintain persistent memory across session boundaries.

---

## Your role

You are the **evaluator**. You orchestrate the evaluation by spawning sub-agents (the **evaluated agents**), each running in isolation with a shared SQLite store. After each sub-agent finishes, you verify outcomes by inspecting the DB directly and by reading the sub-agent's transcript. You never tell the sub-agent what the assertions are — you give it a task that *requires* persistent memory, and you check whether it used the skill correctly.

## Prerequisites

- This repo is cloned and `node` (>=22) is on PATH.
- The `memory` CLI is installed: run `yarn install` first, then confirm `node bin/memory.js --help` prints the command reference.
- You (the evaluator) have bash access to run `node bin/memory.js` against any `--db` path.

## Evaluation harness

Each **scenario** follows this lifecycle:

```
1. [Evaluator] Create a fresh temp DB directory.
2. [Evaluator] Pre-seed the DB if the scenario requires it (optional).
3. [Evaluator] Spawn sub-agent #1 with a task prompt and the --db path.
4. [Sub-agent #1] Discovers and uses the /ai-memory skill to do the task.
5. [Sub-agent #1] Finishes.
6. [Evaluator] Optionally spawn sub-agent #2 (a "fresh session") with a follow-up task against the SAME --db path. Sub-agent #2 has NO knowledge of what #1 did — it must recover context from the store.
7. [Sub-agent #2] Finishes.
8. [Evaluator] Run assertion checks (DB state via CLI + transcript inspection).
9. [Evaluator] Record PASS/FAIL with evidence.
10. [Evaluator] Delete the temp DB.
```

### Isolation rules

- **Every sub-agent gets a clean conversation context.** Never carry over conversation history between sub-agents. Each one is a fresh `task` invocation.
- **The only shared state is the SQLite file.** Sub-agents communicate through the store and nothing else.
- **Do not leak the skill name in the task prompt.** Say "you have a tool for persistent memory" or similar; let the agent discover and load the `/ai-memory` skill itself. (If it fails to discover the skill, that is a FAIL for "skill discovery.")
- **Do not leak the assertion criteria.** The sub-agent must not know how it will be graded.

### Environment setup per scenario

```bash
# Create an isolated temp directory for this scenario's store
EVAL_DIR=$(mktemp -d -t ai-memory-eval-XXXXXX)
EVAL_DB="$EVAL_DIR/memory.db"
```

Clean up at the end of each scenario:
```bash
rm -rf "$EVAL_DIR"
```

---

## Spawning sub-agents

Use the `task` tool with `subagent_type: "general"` for each evaluated sub-agent. The prompt you give the sub-agent must include:

1. The **task** (see each scenario below) — phrased as a real-world goal, not as "test the skill."
2. The **repo path** (the working directory) so it can run CLI commands.
3. The **`--db` path** to use for every `memory` command: tell it explicitly, e.g. "Use `--db /tmp/ai-memory-eval-XXXX/memory.db` for all memory commands."
4. A reminder: "You have access to persistent memory via a skill. Discover and use it."

### Sub-agent prompt template

```
You are working in the repository at <REPO_PATH>.

<SCENARIO_TASK_DESCRIPTION>

You have access to a persistent memory system. Before you begin, discover the relevant skill in this repo and load it. Use `--db <EVAL_DB>` for all memory commands so your memories are stored in the evaluation database.

<ANY_ADDITIONAL_INSTRUCTIONS>

When you are done, write a short summary of what you did and what you stored in memory.
```

---

## Verification methods

### A. DB state assertions (deterministic)

After sub-agents finish, you run `node bin/memory.js --db <EVAL_DB> <command>` yourself and assert on the output. Each assertion is either PASS or FAIL.

- **Exact**: `stats` returns a specific memory/edge count. Note: `stats` also reports `active_memories` and `memories_by_status` (a breakdown by status: `active`, `superseded`, `deprecated`, `merged`).
- **Existence**: `search` or `list --where` returns at least one memory matching a condition. Note: `search`, `list`, and `tags` default to `active` memories only; pass `--all` to include superseded, deprecated, and merged memories.
- **Content**: `get <id>` returns a memory whose content contains a specific keyword or phrase.
- **Metadata**: `list --where "metadata->>'$.kind' = '...'"` returns the expected count.
- **Graph**: `relations <id>` returns edges of the expected kind and direction.

Record the raw CLI output as evidence for each assertion.

### B. Transcript inspection (qualitative)

Read the sub-agent's final message and its tool-call trace. Check for:

- **Skill discovery**: Did it load the `/ai-memory` skill (via the `skill` tool) before using memory commands?
- **Correct CLI usage**: Did it use correct command syntax? Did it pass `--db`? Did it parse JSON output correctly? Did it use the addition-only commands (`supersede`, `deprecate`, `merge`) when revising or removing memories, rather than the removed `update --content` or bare `delete`?
- **Memory quality**: Are stored memories self-contained, one-concept-per-memory, with searchable keywords? (Per the "Writing good memories" guidance in SKILL.md.)
- **Frontier loop** (where applicable): Did it use search → read → traverse, or did it try to dump the whole DB?
- **FTS5 query construction** (where applicable): When an initial search returned nothing, did it retry with simpler queries, OR, or quoted phrases?
- **Session summary** (where applicable): Did it store a `kind: "summary"` memory at the end?

For transcript checks, record the specific tool-call evidence (what command was run, what the agent said).

---

## Scenarios

### Scenario 1: Store + recall across sessions

**Goal**: A sub-agent stores a decision; a fresh sub-agent retrieves it via search.

#### Phase 1 — Store

Spawn sub-agent #1 with:

```
You are working on a TypeScript project. You've just made an important architectural decision: the project will use SQLite (via node:sqlite) for all local persistence, NOT better-sqlite3, because it avoids a native dependency. The reasoning is: native deps break in CI, and node:sqlite ships with Node 22+.

Store this decision in persistent memory so a future session can recall it. Also store the rationale as a separate memory and link them.

Use `--db <EVAL_DB>` for all memory commands.
```

**DB assertions (after #1 finishes):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 1.1 | At least 2 memories stored | `stats` | `memories >= 2` |
| 1.2 | At least 1 edge created | `stats` | `edges >= 1` |
| 1.3 | A memory mentioning "sqlite" exists | `search "sqlite"` | results length >= 1 |
| 1.4 | A memory mentioning "better-sqlite3" or "native" exists | `search "better-sqlite3 OR native"` | results length >= 1 |

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 1.5 | Sub-agent loaded the `/ai-memory` skill | `skill` tool call with name `ai-memory` |
| 1.6 | Sub-agent used `memory store` at least twice | bash calls to `memory store` |
| 1.7 | Sub-agent used `memory link` | bash call to `memory link` |

#### Phase 2 — Recall (fresh session)

Spawn sub-agent #2 (fresh context, same `--db`):

```
You are joining an ongoing TypeScript project. You need to get oriented on the key architectural decisions made so far. Search persistent memory for decisions about the database/persistence choice, and report what was decided and why.

This is a read-only task. Do not store any new memories or create any edges. Only search, read, and traverse.

Use `--db <EVAL_DB>` for all memory commands.
```

**DB assertions (after #2 finishes):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 1.8 | The store is unchanged (read-only) | `stats` | `memories` and `edges` same as after #1 |
| 1.9 | The "sqlite" memory is findable | `search "sqlite"` | results length >= 1 |

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 1.10 | Sub-agent loaded the `/ai-memory` skill | `skill` tool call |
| 1.11 | Sub-agent used `memory search` | bash call to `memory search` |
| 1.12 | Sub-agent correctly reported the SQLite decision | final message mentions SQLite and node:sqlite |
| 1.13 | Sub-agent correctly reported the rationale | final message mentions native deps / better-sqlite3 / CI |

---

### Scenario 2: Graph — relations + memory links

**Goal**: Sub-agent stores related memories, creates typed relations, and uses `memory://` links in content. A fresh sub-agent traverses the graph.

#### Phase 1 — Build the graph

Spawn sub-agent #1:

```
You are designing a feature: a CLI tool for managing bookmarks. You've identified three design alternatives:

1. "Store bookmarks as JSON file" — simple but no query capability.
2. "Store bookmarks in SQLite with FTS5" — full-text search, more setup.
3. "Store bookmarks in plain markdown files" — portable, grep-able, no search.

Store each alternative as a separate memory. Create relations between them: the SQLite alternative "contradicts" the JSON-file alternative (they're mutually exclusive approaches), and the markdown alternative "extends" the JSON-file approach (it's a refinement). Also, in the SQLite alternative's content, include a memory:// link to the JSON alternative.

Use `--db <EVAL_DB>` for all memory commands.
```

**DB assertions (after #1):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 2.1 | Exactly 3 memories stored | `stats` | `memories == 3` |
| 2.2 | At least 2 edges | `stats` | `edges >= 2` |
| 2.3 | A "contradicts" edge exists | `relations <id-of-sqlite>` (check `list` output) | an edge with kind `contradicts` |
| 2.4 | An "extends" edge exists | `relations <id-of-markdown>` | an edge with kind `extends` |
| 2.5 | At least one memory content contains `memory://` | `search "memory"` or `get` each and check content | a content field includes `memory://<uuid>` |

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 2.6 | Loaded the skill | `skill` tool call |
| 2.7 | Used `memory link` with `--kind` | bash call to `memory link ... --kind contradicts` (or extends) |
| 2.8 | One memory content includes a `memory://` link | `memory store` content or `memory get` output containing `memory://` |

#### Phase 2 — Traverse the graph (fresh session)

Spawn sub-agent #2:

```
You are continuing work on a bookmark CLI tool. A previous session explored design alternatives and stored them in memory. Find the alternatives, identify which ones contradict or extend each other, and report the full design landscape.

Use `--db <EVAL_DB>` for all memory commands.
```

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 2.9 | Loaded the skill | `skill` tool call |
| 2.10 | Used `memory search` to find alternatives | bash call to `memory search` |
| 2.11 | Used `memory relations` to traverse | bash call to `memory relations` |
| 2.12 | Correctly identified the contradicting pair | final message mentions SQLite vs JSON as contradicting |
| 2.13 | Correctly identified the extending pair | final message mentions markdown extends JSON |

---

### Scenario 3: Frontier loop on a large store

**Goal**: The store is pre-seeded with many memories. The sub-agent must explore using the frontier loop (search → read → traverse), NOT load the whole DB.

#### Pre-seed (evaluator does this)

Before spawning any sub-agent, pre-seed the DB with 50+ memories across several topics (e.g., architecture decisions, bug reports, meeting notes, API docs). Create a realistic graph with relations. Include a few `kind: "summary"` memories.

Use this seeding script:

```bash
EVAL_DIR=$(mktemp -d -t ai-memory-eval-XXXXXX)
EVAL_DB="$EVAL_DB/memory.db"
BIN="node $(pwd)/bin/memory.js"

# Helper: store a memory and capture its id
sm() { $BIN --db "$EVAL_DB" store "$1" --metadata "$2"; }

# --- Architecture decisions (10) ---
d1=$(sm "We chose REST over GraphQL for the public API. Simpler tooling, adequate for our needs." '{"kind":"decision","tags":["api","rest","graphql"]}')
d2=$(sm "Authentication uses JWT tokens with a 24-hour expiry. Refresh tokens last 7 days." '{"kind":"decision","tags":["auth","jwt"]}')
d3=$(sm "The database is PostgreSQL 16 running in a Docker container for local dev." '{"kind":"decision","tags":["database","postgres","docker"]}')
d4=$(sm "We use Redis for session caching and rate limiting." '{"kind":"decision","tags":["redis","cache"]}')
d5=$(sm "Frontend is React 18 with TypeScript. State management via Zustand, not Redux." '{"kind":"decision","tags":["frontend","react","typescript","zustand"]}')
d6=$(sm "We chose Vite over Webpack for the build tool. Faster HMR, simpler config." '{"kind":"decision","tags":["build","vite","webpack"]}')
d7=$(sm "Error tracking via Sentry. DSN is in environment variables, never committed." '{"kind":"decision","tags":["observability","sentry"]}')
d8=$(sm "CI runs on GitHub Actions: lint, typecheck, test, build. Three node versions: 20, 22, 24." '{"kind":"decision","tags":["ci","github-actions"]}')
d9=$(sm "We deploy to Fly.io, not AWS. Simpler for small team, good DX." '{"kind":"decision","tags":["deploy","fly","aws"]}')
d10=$(sm "API versioning: URL-based (/v1/, /v2/). No header-based versioning." '{"kind":"decision","tags":["api","versioning"]}')

# --- Bug reports (10) ---
b1=$(sm "Bug: race condition in the session cleanup job. Multiple workers can delete the same session row simultaneously." '{"kind":"bug","tags":["bug","session","race-condition"]}')
b2=$(sm "Bug: the Vite dev server hangs on first load when there are circular imports. Workaround: restart the server." '{"kind":"bug","tags":["bug","vite","circular-import"]}')
b3=$(sm "Bug: PostgreSQL connection pool exhausts under load test (100 concurrent users). Pool size is 5, needs tuning." '{"kind":"bug","tags":["bug","postgres","connection-pool"]}')
b4=$(sm "Bug: JWT tokens decoded incorrectly when the secret has a plus sign (+). Base64url issue." '{"kind":"bug","tags":["bug","jwt","base64"]}')
b5=$(sm "Bug: Redis MEMORY command returns error when key has no TTL. Need to check TTL before calling MEMORY." '{"kind":"bug","tags":["bug","redis"]}')
b6=$(sm "Bug: React useEffect runs twice in StrictMode, causing duplicate API calls. Fix: add cleanup." '{"kind":"bug","tags":["bug","react","strict-mode"]}')
b7=$(sm "Bug: Sentry breadcrumb truncation loses stack traces. Need to increase maxBreadcrumbs config." '{"kind":"bug","tags":["bug","sentry"]}')
b8=$(sm "Bug: Fly.io deployment fails when Dockerfile uses alpine 3.18. Downgrade to 3.17." '{"kind":"bug","tags":["bug","fly","docker"]}')
b9=$(sm "Bug: API v1 and v2 share the same route table. Adding a v2 endpoint accidentally overrides the v1 route." '{"kind":"bug","tags":["bug","api","versioning"]}')
b10=$(sm "Bug: Zustand store does not persist across page reloads. Need middleware: persist." '{"kind":"bug","tags":["bug","zustand","persist"]}')

# --- Meeting notes (10) ---
m1=$(sm "Meeting 2024-01-15: Team decided to migrate from REST to tRPC for internal services. Public API stays REST." '{"kind":"meeting","tags":["meeting","trpc","rest"]}')
m2=$(sm "Meeting 2024-01-22: Reviewed auth system. Decided to add OAuth2 support alongside JWT. GitHub and Google providers." '{"kind":"meeting","tags":["meeting","auth","oauth"]}')
m3=$(sm "Meeting 2024-02-05: Postgres migration plan. Move from 15 to 16. Test in staging first. 2-week window." '{"kind":"meeting","tags":["meeting","postgres","migration"]}')
m4=$(sm "Meeting 2024-02-19: Frontend performance review. React bundle is 800KB. Target: 300KB. Code-split routes." '{"kind":"meeting","tags":["meeting","react","performance"]}')
m5=$(sm "Meeting 2024-03-04: Vite 5 upgrade. Breaking changes in CSS handling. Need to update PostCSS config." '{"kind":"meeting","tags":["meeting","vite","upgrade"]}')
m6=$(sm "Meeting 2024-03-18: Sentry integration review. Added release tracking. Need source maps upload in CI." '{"kind":"meeting","tags":["meeting","sentry","ci"]}')
m7=$(sm "Meeting 2024-04-01: Fly.io scaling issues. Autoscaling configured but cold starts take 3s. Considering pre-warm." '{"kind":"meeting","tags":["meeting","fly","autoscaling"]}')
m8=$(sm "Meeting 2024-04-15: API versioning discussion. v1 will be deprecated in Q3. v2 has breaking changes in pagination." '{"kind":"meeting","tags":["meeting","api","versioning"]}')
m9=$(sm "Meeting 2024-05-06: Redis memory usage at 80%. Need to add eviction policy or scale up. Decided: LRU eviction." '{"kind":"meeting","tags":["meeting","redis","memory"]}')
m10=$(sm "Meeting 2024-05-20: Zustand persist middleware added. Test the hydration flow on mobile." '{"kind":"meeting","tags":["meeting","zustand","persist"]}')

# --- API documentation (10) ---
a1=$(sm "POST /v1/sessions: Creates a new session. Request: {userId, deviceId}. Response: {sessionId, token}. Auth: required." '{"kind":"api-doc","tags":["api","sessions"]}')
a2=$(sm "DELETE /v1/sessions/:id: Ends a session. Invalidates the JWT. Response: 204. Auth: required, own-session only." '{"kind":"api-doc","tags":["api","sessions"]}')
a3=$(sm "GET /v1/users/:id: Returns user profile. Response: {id, email, name, avatar}. Auth: required." '{"kind":"api-doc","tags":["api","users"]}')
a4=$(sm "PATCH /v1/users/:id: Updates user profile. Partial update supported. Fields: name, avatar. Auth: required, own-profile only." '{"kind":"api-doc","tags":["api","users"]}')
a5=$(sm "POST /v1/bookmarks: Creates a bookmark. Request: {url, title, tags}. Response: {bookmarkId}. Auth: required." '{"kind":"api-doc","tags":["api","bookmarks"]}')
a6=$(sm "GET /v1/bookmarks: Lists bookmarks. Query params: tag, search, limit, offset. Response: [{id, url, title, tags}]. Auth: required." '{"kind":"api-doc","tags":["api","bookmarks"]}')
a7=$(sm "DELETE /v1/bookmarks/:id: Deletes a bookmark. Response: 204. Auth: required, own-bookmark only." '{"kind":"api-doc","tags":["api","bookmarks"]}')
a8=$(sm "POST /v1/auth/oauth/github: Initiates GitHub OAuth flow. Redirects to GitHub. Callback: /v1/auth/oauth/github/callback." '{"kind":"api-doc","tags":["api","auth","oauth"]}')
a9=$(sm "POST /v1/auth/oauth/google: Initiates Google OAuth flow. Redirects to Google. Callback: /v1/auth/oauth/google/callback." '{"kind":"api-doc","tags":["api","auth","oauth"]}')
a10=$(sm "GET /v1/health: Health check endpoint. No auth. Response: {status: ok, version, uptime}." '{"kind":"api-doc","tags":["api","health"]}')

# --- Summaries (3) ---
s1=$(sm "Session summary 2024-01-15: Explored API architecture. Decided REST for public, tRPC for internal. Next: implement tRPC router for internal services. See memory://$d1 for REST decision." '{"kind":"summary","tags":["summary","api","trpc"]}')
s2=$(sm "Session summary 2024-02-05: Database migration planning. Postgres 15 to 16. Tested in staging. Bug found in connection pool (see memory://$b3). Next: fix pool size, proceed with migration." '{"kind":"summary","tags":["summary","postgres","migration"]}')
s3=$(sm "Session summary 2024-04-01: Deployment and scaling review. Fly.io autoscaling configured but cold starts are slow. Next: evaluate pre-warm strategy. See memory://$m7." '{"kind":"summary","tags":["summary","fly","scaling"]}')

# --- Relations ---
$BIN --db "$EVAL_DB" link "$b3" "$d3" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$b4" "$d2" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$b5" "$d4" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$b6" "$d5" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$b7" "$d7" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$b8" "$d9" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$b9" "$d10" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$b10" "$d5" --kind "relates-to"
$BIN --db "$EVAL_DB" link "$s1" "$d1" --kind "references"
$BIN --db "$EVAL_DB" link "$s2" "$b3" --kind "references"
$BIN --db "$EVAL_DB" link "$s3" "$m7" --kind "references"
$BIN --db "$EVAL_DB" link "$m1" "$d1" --kind "references"
$BIN --db "$EVAL_DB" link "$m2" "$d2" --kind "references"
$BIN --db "$EVAL_DB" link "$m4" "$d5" --kind "references"
$BIN --db "$EVAL_DB" link "$a8" "$m2" --kind "implements"
$BIN --db "$EVAL_DB" link "$a9" "$m2" --kind "implements"

echo "Seeded DB at: $EVAL_DB"
echo "Stats:"
$BIN --db "$EVAL_DB" stats
```

> **Note**: The evaluator runs this seeding script. It produces ~43 memories and ~16 relations. Verify `stats` shows the expected counts before proceeding.

#### Phase 1 — Explore

Spawn sub-agent #1:

```
You are joining a project mid-flight. A previous team member left behind a memory store with dozens of entries — decisions, bugs, meeting notes, and API docs. You cannot and should not load everything into context.

Your task: Get oriented on the auth/authentication system. Search memory for auth-related decisions, find related bugs and meeting notes, and report:
1. What auth approach was decided (JWT, OAuth, etc.)
2. What auth-related bugs exist
3. What auth-related meetings happened
4. What auth API endpoints are documented

Do NOT load all memories. Use the frontier approach: search by keyword, read the most relevant, traverse relations to related memories, repeat.

This is a read-only task. Do not store any new memories or create any edges. Only search, read, and traverse.

Use `--db <EVAL_DB>` for all memory commands.
```

**DB assertions (after #1):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 3.1 | The store was not modified (read-only) | `stats` | memory/edge counts unchanged from seeded state |

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 3.2 | Loaded the skill | `skill` tool call |
| 3.3 | Used `memory search` with auth-related keywords | bash call(s) to `memory search` with terms like "auth", "jwt", "oauth", "authentication" |
| 3.4 | Used `memory get` to read specific memories | bash call(s) to `memory get <id>` |
| 3.5 | Used `memory relations` to traverse | bash call(s) to `memory relations <id>` |
| 3.6 | Did NOT attempt `memory list` without limit or with a very high limit | no `memory list` call without `--limit` or with `--limit` > 20 |
| 3.7 | Correctly identified JWT decision | final message mentions JWT, 24-hour expiry |
| 3.8 | Correctly identified OAuth2 addition | final message mentions OAuth2, GitHub and Google providers |
| 3.9 | Correctly identified the JWT base64 bug | final message mentions the `+` sign / base64url bug |
| 3.10 | Correctly identified auth API endpoints | final message mentions at least the OAuth endpoints |

---

### Scenario 4: Session summaries

**Goal**: A sub-agent stores a `kind: "summary"` memory at the end of its work. A fresh sub-agent orients itself by searching for summaries first.

#### Phase 1 — Work + summarize

Spawn sub-agent #1:

```
You are working on a Node.js project. You've just spent this session doing the following work:

1. You investigated why the test suite is slow (takes 45s). You found that the integration tests re-open a SQLite database on every test case, which is the bottleneck.
2. You decided to use a shared in-memory database for the test suite, with a setup hook that copies the schema once.
3. You documented the fix in the README.

Before you finish this session, store a session summary in persistent memory. Follow the session-summary convention from the ai-memory skill: a kind=summary memory that recaps what was done, key decisions, and what's next. Also store the key findings and decisions as individual memories, and link the summary to them.

Use `--db <EVAL_DB>` for all memory commands.
```

**DB assertions (after #1):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 4.1 | At least 3 memories stored | `stats` | `memories >= 3` |
| 4.2 | A summary memory exists | `list --where "metadata->>'$.kind' = 'summary'"` | length >= 1 |
| 4.3 | Exactly 1 summary memory | `list --where "metadata->>'$.kind' = 'summary'"` | length == 1 |
| 4.4 | A memory mentioning "sqlite" or "database" exists | `search "sqlite"` or `search "database"` | length >= 1 |
| 4.5 | A memory mentioning "test" or "slow" exists | `search "test"` | length >= 1 |
| 4.6 | At least 1 edge from the summary | `relations <summary-id>` | at least 1 outgoing edge |

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 4.7 | Loaded the skill | `skill` tool call |
| 4.8 | Stored a memory with `kind: "summary"` metadata | `memory store ... --metadata '{"kind":"summary",...}'` |
| 4.9 | Linked the summary to other memories | `memory link <summary-id> <other-id>` |

#### Phase 2 — Orient from summaries (fresh session)

Spawn sub-agent #2 (fresh context, same `--db`):

```
You are starting a new session on a Node.js project. You have no context from prior sessions. Get oriented: search persistent memory for session summaries, read them, and report what was done previously, what decisions were made, and what's next.

Use `--db <EVAL_DB>` for all memory commands.
```

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 4.10 | Loaded the skill | `skill` tool call |
| 4.11 | Searched for summaries first | first `memory search` or `memory list` targets `kind=summary` (e.g., `list --where "metadata->>'$.kind' = 'summary'"`) |
| 4.12 | Read the summary memory | `memory get <id>` for the summary |
| 4.13 | Traversed relations from the summary | `memory relations <id>` on the summary or linked memories |
| 4.14 | Correctly reported the test-suite slowness finding | final message mentions slow tests / 45s |
| 4.15 | Correctly reported the in-memory DB decision | final message mentions in-memory database / shared schema |
| 4.16 | Correctly reported "what's next" | final message references a next step from the summary |

---

### Scenario 5: FTS5 query construction

**Goal**: A sub-agent must retrieve a memory whose content uses multi-word phrases. An initial naive search returns too many irrelevant results or nothing useful; the agent must retry with correct FTS5 syntax (OR, quoted phrases).

#### Pre-seed (evaluator does this)

Before spawning any sub-agent, pre-seed the DB with ~18 decoy memories that share individual keywords with the 3 target memories but are about unrelated topics. This ensures single-term searches (e.g., "monolith", "microservices", "architecture") return many results, forcing the agent to narrow with OR or quoted-phrase queries to find the specific design-decision memories.

```bash
EVAL_DIR=$(mktemp -d -t ai-memory-eval-XXXXXX)
EVAL_DB="$EVAL_DIR/memory.db"
BIN="node $(pwd)/bin/memory.js"

sm() { $BIN --db "$EVAL_DB" store "$1" --metadata "$2"; }

# --- Decoy memories sharing the keyword "monolith" (5) ---
sm "The ancient monolith monument in the city square was erected in 1893." '{"kind":"note","tags":["history","monument"]}'
sm "Monolith board game review: excellent 2-player asymmetric strategy." '{"kind":"review","tags":["games","board"]}'
sm "The company rebranded from Monolith Labs to Nova Systems in 2023." '{"kind":"note","tags":["history","branding"]}'
sm "Monolith Press published three sci-fi novels last quarter." '{"kind":"note","tags":["publishing"]}'
sm "The black monolith in the film is a classic sci-fi symbol." '{"kind":"note","tags":["film","culture"]}'

# --- Decoy memories sharing the keyword "microservices" (5) ---
sm "Microservices meetup 2024: talk on service mesh adoption." '{"kind":"note","tags":["events","meetup"]}'
sm "Microservices Weekly newsletter issue 42 covered circuit breakers." '{"kind":"note","tags":["newsletter"]}'
sm "The book 'Microservices Patterns' by Richardson is a recommended read." '{"kind":"note","tags":["reading","books"]}'
sm "Microservices conference 2023 had a great keynote on observability." '{"kind":"note","tags":["events","conference"]}'
sm "Microservices training course available on the internal learning platform." '{"kind":"note","tags":["training"]}'

# --- Decoy memories sharing the keyword "architecture" (5) ---
sm "The Gothic architecture of the cathedral features flying buttresses." '{"kind":"note","tags":["history","building"]}'
sm "Cloud architecture diagram for the migration is in the wiki." '{"kind":"note","tags":["cloud","diagram"]}'
sm "The database architecture uses read replicas for scaling." '{"kind":"note","tags":["database","infra"]}'
sm "Security architecture review scheduled for next sprint." '{"kind":"note","tags":["security","review"]}'
sm "Network architecture update: moved to a hub-and-spoke VPN topology." '{"kind":"note","tags":["network","vpn"]}'

# --- Decoy memories sharing "design" or "alternatives" (3) ---
sm "UI design system: components use a 4px spacing grid." '{"kind":"note","tags":["design","ui"]}'
sm "The team evaluated alternatives for the hosting provider." '{"kind":"note","tags":["infra","hosting"]}'
sm "Logo design feedback: prefer the minimalist variant." '{"kind":"note","tags":["design","branding"]}'

echo "Decoys seeded. Stats:"
$BIN --db "$EVAL_DB" stats
```

#### Phase 1 — Store with tricky content

Spawn sub-agent #1:

```
You are documenting design decisions for a web application. Store the following three memories:

1. "We rejected the microservices architecture because the team is too small to operate distributed systems. Monolith is the pragmatic choice for a 3-person team."
2. "The design alternatives considered were: microservices, modular monolith, and serverless. The modular monolith won."
3. "We chose a modular monolith with strict module boundaries. Each module has its own database schema. Modules communicate via internal events."

Store each as a separate memory. Link the first (rejection rationale) to the third (final choice) with a 'context' relation.

Use `--db <EVAL_DB>` for all memory commands.
```

**DB assertions (after #1):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 5.1 | Exactly 21 memories stored (18 decoys + 3 new) | `stats` | `memories == 21` |
| 5.2 | At least 1 edge | `stats` | `edges >= 1` |
| 5.3 | A memory with "microservices" exists | `search "microservices"` | length >= 1 |
| 5.4 | A memory with "monolith" exists | `search "monolith"` | length >= 1 |
| 5.5 | Searching "monolith" returns many results (decoys) | `search "monolith"` | length >= 5 |

#### Phase 2 — Retrieve with complex queries (fresh session)

Spawn sub-agent #2:

```
You are joining a project. A previous session stored design decisions about the application architecture. You need to find:

1. What design alternatives were considered?
2. Why was the microservices approach rejected?
3. What was the final architecture choice and why?

Search persistent memory for these answers. Be thorough — if your first search doesn't find what you need, try different query strategies.

Use `--db <EVAL_DB>` for all memory commands.
```

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 5.6 | Loaded the skill | `skill` tool call |
| 5.7 | Used `memory search` | bash call(s) to `memory search` |
| 5.8 | When an initial search returned too many or irrelevant results, retried with a different query | at least 2 different `memory search` calls with different terms or strategies |
| 5.9 | Used OR syntax to widen a search | a `memory search` call using `OR` (e.g., `microservices OR monolith OR serverless`) |
| 5.10 | Used quoted phrase syntax to narrow to a multi-word concept | a `memory search` call using quoted phrases (e.g., `"design alternatives"` or `"modular monolith"`) |
| 5.11 | Found the design alternatives memory | final message mentions microservices, modular monolith, serverless |
| 5.12 | Found the rejection rationale | final message mentions team too small / 3-person team |
| 5.13 | Found the final architecture choice | final message mentions modular monolith, module boundaries, internal events |

---

### Scenario 6: Metadata filtering

**Goal**: A sub-agent stores memories with rich metadata (tags, kind), then a fresh sub-agent retrieves them using `list --where` and `search --where` filters.

#### Phase 1 — Store with metadata

Spawn sub-agent #1:

```
You are triaging issues in a project. Store the following memories, each with appropriate metadata (use kind and tags):

1. A bug: "Login page throws a 500 error when the database is unreachable. Should degrade gracefully with a 503 and a retry message." — kind: bug, tags: ["critical", "auth", "login"]
2. A bug: "Profile page does not update avatar after upload. Requires a page refresh. Missing cache invalidation." — kind: bug, tags: ["minor", "profile", "avatar"]
3. A decision: "We use structured logging with pino, not winston. Pino is faster and has better async support." — kind: decision, tags: ["logging", "pino", "winston"]
4. A decision: "We use Vitest, not Jest, for testing. Vitest has native ESM support and better Vite integration." — kind: decision, tags: ["testing", "vitest", "jest"]
5. A note: "The API rate limiter is configured at 100 req/min per user. Exceeded requests get a 429 with Retry-After header." — kind: note, tags: ["api", "rate-limit", "config"]

Use `--db <EVAL_DB>` for all memory commands.
```

**DB assertions (after #1):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 6.1 | Exactly 5 memories stored | `stats` | `memories == 5` |
| 6.2 | 2 bugs, 2 decisions, 1 note | `list --where "metadata->>'$.kind' = 'bug'"` → 2; `= 'decision'"` → 2; `= 'note'"` → 1 | counts match |
| 6.3 | Tags include "critical" | `tags` | a tag with `tag: "critical"` and `count: 1` |
| 6.4 | Tags include "auth" | `tags` | a tag with `tag: "auth"` and `count: 1` |
| 6.5 | Tags with kind filter works | `tags --where "metadata->>'$.kind' = 'bug'"` | includes "critical" and "minor", excludes "logging" and "testing" |

#### Phase 2 — Retrieve with filters (fresh session)

Spawn sub-agent #2:

```
You are joining a project. A previous session stored bugs and decisions in persistent memory. Your task:

1. Find all bugs (not decisions or notes) and report each one.
2. Find all decisions and report each one.
3. Find all memories tagged "auth" and report them.
4. Find critical bugs specifically (tagged "critical") and report them.

Use `--db <EVAL_DB>` for all memory commands.
```

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 6.6 | Loaded the skill | `skill` tool call |
| 6.7 | Used `list --where` with a kind filter | `memory list --where "metadata->>'$.kind' = 'bug'"` |
| 6.8 | Used `list --where` with a kind filter for decisions | `memory list --where "metadata->>'$.kind' = 'decision'"` |
| 6.9 | Used `tags` to find available tags, or used `list --where` with a tag filter | `memory tags` or `memory list --where "..."` targeting tags |
| 6.10 | Used `search --where` to combine text search with metadata filter | `memory search "..." --where "metadata->>'$.kind' = 'bug'"` or similar |
| 6.11 | Correctly reported both bugs | final message mentions the 500 error / login bug AND the avatar / profile bug |
| 6.12 | Correctly reported both decisions | final message mentions pino/logging AND vitest/testing |
| 6.13 | Correctly reported auth-tagged memories | final message mentions the login 500 bug |
| 6.14 | Correctly reported critical bugs | final message mentions the login 500 bug specifically as critical |

---

### Scenario 7: Addition-only model — supersede, deprecate, merge

**Goal**: A sub-agent uses the addition-only commands (`supersede`, `deprecate`, `merge`) to revise, soft-delete, and combine memories. A fresh sub-agent verifies the history is preserved by using `--all` and traversing `supersedes`/`merges` edges.

#### Phase 1 — Revise, deprecate, and merge

Spawn sub-agent #1:

```
You are maintaining a project's persistent memory. Three tasks:

1. A decision was previously stored that says "We use REST for all APIs." Store a revised version: "We use REST for public APIs and tRPC for internal services." Supersede the old decision with the new one.

2. An obsolete memory about "configuring Webpack for the build" is no longer relevant — the project moved to Vite. Deprecate it.

3. Two duplicate memories exist about session caching: one says "We use Redis for session caching" and another says "Redis handles session cache." Merge them into a single memory: "Redis handles session caching and rate limiting." Merge the two originals into the new one.

Before you start, search the store to find the relevant memories. Then use the appropriate memory commands to revise, deprecate, and merge.

Use `--db <EVAL_DB>` for all memory commands.
```

**Pre-seed (evaluator does this before spawning #1):**

```bash
EVAL_DIR=$(mktemp -d -t ai-memory-eval-XXXXXX)
EVAL_DB="$EVAL_DIR/memory.db"
BIN="node $(pwd)/bin/memory.js"

sm() { $BIN --db "$EVAL_DB" store "$1" --metadata "$2"; }

# The REST decision (to be superseded)
rest_id=$(sm "We use REST for all APIs." '{"kind":"decision","tags":["api","rest"]}')

# The Webpack memory (to be deprecated)
webpack_id=$(sm "Configure Webpack with splitChunks and TerserPlugin for production builds." '{"kind":"note","tags":["build","webpack"]}')

# Two duplicate Redis memories (to be merged)
redis1_id=$(sm "We use Redis for session caching." '{"kind":"decision","tags":["redis","cache"]}')
redis2_id=$(sm "Redis handles session cache." '{"kind":"decision","tags":["redis","cache"]}')

echo "Pre-seeded DB at: $EVAL_DB"
echo "IDs: rest=$rest_id webpack=$webpack_id redis1=$redis1_id redis2=$redis2_id"
```

**DB assertions (after #1):**

| # | Assertion | Command | Check |
|---|-----------|---------|-------|
| 7.1 | Total memories is 6 (4 original + 1 supersede + 1 merge) | `stats` | `memories == 6` |
| 7.2 | Active memories is 2 (1 deprecated, 1 superseded, 2 merged) | `stats` | `active_memories == 2` |
| 7.3 | memories_by_status has expected breakdown | `stats` | `memories_by_status` has `active: 2`, `superseded: 1`, `deprecated: 1`, `merged: 2` |
| 7.4 | The old REST decision is superseded | `get <rest_id>` | `status` is `superseded` |
| 7.5 | A supersedes edge links old to new | `relations <rest_id>` | an outgoing edge with kind `supersedes` |
| 7.6 | The new REST decision is active | `search "tRPC"` | a result with `status: "active"` mentioning tRPC |
| 7.7 | The Webpack memory is deprecated | `get <webpack_id>` | `status` is `deprecated` |
| 7.8 | The Webpack memory does not appear in default search | `search "Webpack"` | results length == 0 |
| 7.9 | The Webpack memory appears with --all | `search "Webpack" --all` | results length >= 1 |
| 7.10 | Both Redis originals are merged | `get <redis1_id>` and `get <redis2_id>` | both have `status: "merged"` |
| 7.11 | Merges edges link originals to the merged memory | `relations <redis1_id>` | an outgoing edge with kind `merges` |
| 7.12 | The merged memory is active and findable | `search "rate limiting"` | a result with `status: "active"` mentioning "rate limiting" |

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 7.13 | Loaded the skill | `skill` tool call with name `ai-memory` |
| 7.14 | Used `memory supersede` to revise the REST decision | bash call to `memory supersede <id> --content "..."` |
| 7.15 | Used `memory deprecate` to soft-delete the Webpack memory | bash call to `memory deprecate <id>` |
| 7.16 | Used `memory merge` to combine the Redis memories | bash call to `memory merge <id1> <id2> --content "..."` |
| 7.17 | Did NOT use `memory delete` without `--force` | no bare `memory delete <id>` call (delete without --force errors) |
| 7.18 | Did NOT use `memory update --content` | no `memory update <id> --content` call (removed in addition-only model) |

#### Phase 2 — Recover history (fresh session)

Spawn sub-agent #2 (fresh context, same `--db`):

```
You are joining a project. A previous session revised some decisions in persistent memory — some memories were superseded, deprecated, or merged. Your task:

1. Search for the current decision about the API approach (REST / tRPC). Report what the current decision is.
2. Find out if there was a previous, now-superseded version of that decision. Use --all to search for it, and follow the supersedes relation to understand the history.
3. Check if any memories were deprecated. What was deprecated and why?
4. Check if any memories were merged. What were the originals and what is the merged result?

Use `--db <EVAL_DB>` for all memory commands.
```

**Transcript assertions:**

| # | Assertion | Evidence |
|---|-----------|----------|
| 7.19 | Loaded the skill | `skill` tool call |
| 7.20 | Found the current (active) API decision | `memory search "tRPC"` or `memory search "REST"` returns the active version |
| 7.21 | Used `--all` to find superseded/deprecated/merged memories | bash call to `memory search "..." --all` or `memory list --all` |
| 7.22 | Followed a `supersedes` relation to find the old version | `memory relations <id>` on the superseded or current memory |
| 7.23 | Correctly reported the old REST-only decision was superseded | final message mentions the old decision and that it was superseded |
| 7.24 | Correctly identified the deprecated Webpack memory | final message mentions Webpack was deprecated |
| 7.25 | Correctly identified the merged Redis memories | final message mentions the two originals and the merged result |
| 7.26 | Followed a `merges` relation to find the merged result | `memory relations <id>` on one of the merged originals |

---

## Running the full evaluation

Execute scenarios 1-7 **sequentially** (not in parallel). Each scenario uses its own temp DB, so there is no cross-contamination, but running sequentially keeps the output traceable.

For each scenario:
1. Record the scenario name and start time.
2. Run the phases (spawn sub-agents via `task` tool).
3. After each phase, run the DB assertions and capture the raw CLI output.
4. After both phases, run the transcript assertions.
5. Record PASS/FAIL for each assertion with evidence.
6. Clean up the temp DB.

### Final report format

After all scenarios complete, produce a summary table:

```
## AI-Memory Skill Evaluation Report
Date: <ISO date>
Evaluator: <model name>

### Results

| Scenario | Phase | Assertion | Result | Evidence |
|----------|-------|-----------|--------|----------|
| 1. Store + recall | Phase 1 | 1.1 At least 2 memories | PASS | stats: {"memories":3,...} |
| 1. Store + recall | Phase 1 | 1.2 At least 1 edge | PASS | stats: {"edges":1,...} |
| ... | ... | ... | ... | ... |

### Summary by scenario

| Scenario | Total | Passed | Failed | Pass rate |
|----------|-------|--------|--------|-----------|
| 1. Store + recall | 13 | 13 | 0 | 100% |
| 2. Graph: relations + links | 13 | 11 | 2 | 85% |
| 3. Frontier loop | 10 | 8 | 2 | 80% |
| 4. Session summaries | 16 | 16 | 0 | 100% |
| 5. FTS5 query construction | 13 | 11 | 2 | 85% |
| 6. Metadata filtering | 14 | 14 | 0 | 100% |
| 7. Addition-only model | 26 | 24 | 2 | 92% |
| **TOTAL** | **105** | **97** | **8** | **92%** |

### Failed assertions detail

(List each failed assertion with the evidence and a brief diagnosis.)

### Transcript quality notes

(Any qualitative observations about how sub-agents used the skill: did they discover it naturally? did they struggle with CLI syntax? did they write good memories?)
```

---

## Evaluator constraints

1. **Never coach the sub-agent.** Do not hint at which commands to run, what metadata to use, or how to structure memories. The task prompt describes the *goal*, not the *method*.
2. **Never run memory commands on behalf of the sub-agent.** You run CLI commands only for assertions, after the sub-agent has finished.
3. **Record everything.** Keep the raw CLI output for every assertion. If an assertion fails, the evidence must show exactly what the DB state was.
4. **One sub-agent at a time.** Even within a scenario, phases are sequential: #1 finishes before #2 starts.
5. **Clean up between scenarios.** Delete the temp DB directory after each scenario.
