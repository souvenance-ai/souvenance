# Security audit — phase 2 of the public-product arc

Date: 2026-10-21 · Auditor: the agent (this session) · Objective: memory://dcd9d55c-96a0-4c19-b2ea-c99f23c047ac (phase 2: security audit BEFORE any exposure)

## Scope and method

Every source file read in full, line by line:

| Surface | File | Exposure |
| --- | --- | --- |
| HTTP server | `src/server.ts` (914 l.) | tokens, multi-store mounts, caps, timeouts |
| MCP stdio | `src/mcp.ts` (525 l.) | JSON-RPC on the agent's own process |
| Export | `src/export.ts` (180 l.) | markdown + YAML frontmatter rendering |
| Deep module | `src/db.ts` (1226 l.) | fork (VACUUM INTO), raw `where`, readonly floor |
| Migrations | `src/migrations.ts` (118 l.) | schema versioning |
| CLI wiring | `bin/souvenance.js` (526 l.) | arg parsing, serve wiring, fork/export verbs |

Plus a **full-history secret scan** over all 70 commits (`git log -p --all --full-history`, patterns: provider keys `sk-`/`ghp_`/AKIA, PEM/PGP private keys, password/secret assignments, bearer headers, emails): **clean** — the only hits are a test fixture constant (`0123456789abcdef…` in `server.auth.test.ts` / `server.tokenfile.test.ts`) and a dependency copyright line in yarn.lock.

## Verdict

**Sound trust architecture, one real wiring defect, two policy questions.** The layered model holds: ro-by-default everywhere (mounts, tokens), non-loopback bind refuses to start without tokens, rw mounts rejected in token mode, timing-safe bearer comparison, body/limit caps with the negative-LIMIT refusal, raw `where` gated local-only with escaped structured filters, token-file strictness (0600 perms, dupes, unknown keys), fork/export never exposed over HTTP, MCP excludes file-writing verbs, transactional versioned migrations. The findings below are hardening, not structural breaks — **except 01, which quietly defeats a documented guarantee**.

## Findings

All seven RESOLVED 2026-10-21 (same day as the audit) — decisions: per-issue `## Resolution` sections; finding 02 by Valentin's pick (lib-level chmod 0600), finding 04 by his structured-token proposal (decision `souv-` pattern, memory://c88a9a61).

| # | Severity | Title | Status |
| --- | --- | --- | --- |
| [01](issues/01-openstore-readonly-flag-dropped.md) | **high** | bin `openStore` drops the readOnly flag — ro mounts open writable and silently migrate | resolved |
| [02](issues/02-store-file-permissions-0644.md) | medium | store files created world-readable (0644) — identity readable by any local user | resolved |
| [03](issues/03-error-message-disclosure-500s.md) | low | 500 responses leak internal error messages (filesystem paths) to remote clients | resolved |
| [04](issues/04-token-min-length-doc-mismatch.md) | low | help claims "64-hex not brute-forceable" but the parser floors at 16 chars, no rate limit | resolved |
| [05](issues/05-mcp-stdin-buffer-cap.md) | info | MCP stdin line buffer is unbounded | resolved |
| [06](issues/06-export-frontmatter-key-injection.md) | low | export frontmatter renders metadata keys unsanitized — YAML key injection | resolved |
| [07](issues/07-fail-skips-store-close.md) | info | `fail()` calls `process.exit` — `finally` never runs, store never closed on error paths | resolved |

## What was checked and found solid (the positive audit record)

- **Auth**: `sha256` + `timingSafeEqual` (length-equalized, never throws); per-store scoping 403; writes 409 without `:rw`; raw `where` 400 without `:where`; token-file mode check `(mode & 0o077) === 0` with win32 carve-out; duplicate secrets/agents/unknown stores refuse at startup.
- **Trust boundary mechanics**: non-loopback bind without tokens refuses to start; store names `^[a-z][a-z0-9-]{0,31}$` + reserved-name set prevents route shadowing; `root` name reserved for grants.
- **Resource caps**: 1 MiB body (declared AND streamed check → lying content-length cannot slide through), limit ≤ 1000, non-negative integer limit/offset (SQLite `LIMIT -1` = unlimited, refused), 30s/10s/5s listener timeouts wired in bin.
- **SQL**: all user data parameterized except raw `where` (a documented, gated trust decision) and structured kind/tag filters (single-quote-escaped via `sqlString`); fork's `VACUUM INTO` path quote-escaped; FTS sanitize fallback strips punctuation, keeps phrases/operators.
- **Path/file safety**: export filenames = 8-hex prefix + `[a-z0-9-]` slug (no traversal); fork target refuses existing file without `--force`; doctor snapshot in `mkdtemp` (0700) removed in `finally`; declared `--store` paths must pre-exist (no silent store creation on a typo'd path).
- **Surface discipline**: fork/export absent from the HTTP route table; MCP tool set excludes both; MCP stdout is protocol-only; CORS-free by default (browsers blocked); no built-in TLS by design with explicit reverse-proxy guidance and an exposure printout at startup.
- **History**: 70 commits scanned for secrets — clean.

## Out of scope (remaining for later phases)

- The VPS unit / nginx vhost / TLS termination — phase 6 execution review (the audit covered the code that will run behind them, not the hosts).
- The npm supply-chain surface (publish workflow, Trusted Publishing) — phase 4.
- A fuzz pass over the HTTP surface (property-based malformed-input testing) — candidate follow-up beyond this audit's read-the-code method.
