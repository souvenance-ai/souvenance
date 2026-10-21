# 05 — MCP stdin line buffer is unbounded

Severity: info · Status: resolved

## The observation

```ts
// src/mcp.ts:437-447
let buffer = "";
for await (const chunk of streams.input) {
  buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  ...
}
```

A client that streams bytes without a newline grows `buffer` without bound — heap exhaustion on a long-lived MCP session. The trust zone is the agent's own process (stdio), so this is hygiene, not a trust boundary; the same cap discipline the HTTP surface applies (1 MiB bodies) is simply missing here.

## Fix

Cap the buffer (e.g. 10 MiB — far above any real tool call, matching MAX_BODY_BYTES generosity): when exceeded, respond `-32700 Parse error`-style or a dedicated JSON-RPC error, drop the buffer up to the last newline, and optionally end the loop. Mirror the HTTP posture: a request that cannot arrive fully within bounds is refused, not absorbed.

## Test

Feed a synthetic `McpStreams.input` (async generator) with >cap bytes and no newline; expect one error response and return.

## Resolution

`MAX_LINE_BYTES` (10 MiB) checks the unterminated tail after each chunk in `runMcpServer` — complete lines in the same chunk are still served; a breach answers one `-32700` and ends the session. Test in src/mcp.test.ts feeds an 10 MiB+1 no-newline stream and asserts the single refusal.
