/**
 * The MCP stdio server (#22): the third thin surface over the store —
 * this time as a BRIDGE, never a second owner. `souv mcp` (the command
 * is #49's; the protocol loop is this unit's) speaks JSON-RPC 2.0 on
 * stdin/stdout (newline-delimited), so any MCP client mounts the store
 * as typed tools. Every tool call is one HTTP call through the Bridge
 * carrying the launch-time grant — the token never crosses the agent's
 * session, and the server stays the only store owner (#17).
 *
 * The mirror rule is the wire's, reused (#22): tools mirror the data
 * routes 1:1 and answer what the routes answer — an MCP agent parses
 * exactly what a curl agent parses, and every refusal arrives as a
 * tool-level `isError` carrying the envelope's message verbatim.
 * Protocol errors stay protocol-only: they speak JSON-RPC, never the
 * store's grammar.
 *
 * Transport is hand-rolled (#16's verdict stands for 0.2.x): the needed
 * subset is small and stable — initialize (echo the client's
 * protocolVersion when it is one we speak, else the server's latest),
 * tools/list, tools/call, ping; every `notifications/*` method is
 * ignored silently; unknown requests get -32601.
 *
 * stdout is protocol-only (JSON-RPC lines); anything an implementation
 * wants to say to a human goes to stderr — never mix the two (an MCP
 * client parses stdout byte-for-byte, so stray output corrupts the
 * stream).
 *
 * The eager probe (#22): when options carry one, it runs before the
 * first line is read — the bridge refuses to speak for a store it
 * cannot reach; the teaching lands on stderr and the loop ends, leaving
 * the process a non-zero exit (the composition root's gesture). A
 * server that dies mid-session cannot crash the protocol: the Bridge
 * throws its reachability teaching and the tools answer `isError`.
 */
import { BridgeError } from '../bridge/bridge.ts';
import type { RouteCall } from '../bridge/bridge.ts';

/** The revision this server answers with when the client requests an unknown one. */
const PROTOCOL_VERSION = '2025-06-18';
const KNOWN_PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
const SERVER_NAME = 'souvenance';

/**
 * Injected into the client's system prompt at initialize — the MCP-native
 * place where the ritual reaches an agent that never loaded the waking
 * skill. Short on purpose: the deep posture is the `skills` tool's to
 * serve, the wire's to teach; this text orients, never duplicates.
 */
const INSTRUCTIONS =
  'souvenance: a persistent, searchable memory for agents — one store, one individual, one continuity. ' +
  'These tools are your store; the refusals teach.\n' +
  '\n' +
  "Ritual: run checkin FIRST — it serves your last session's hot block and the store's stats; " +
  'continue where you left off. An empty store is an unborn individual: run the `setup` skill first.\n' +
  'Write one concept per memory, self-contained, with search keywords in the text. Author the outgoing ' +
  'edges in the SAME call via relations — no store-then-link two-step; an unlinked memory is an island. ' +
  'Content is immutable: supersede a changed decision, deprecate a stale one, merge duplicates.\n' +
  'Before ending a session: store the hot line to your future self, then run checkout — pay its ' +
  'findings until the verdict goes green.\n' +
  'Run skills with name "waking" for the full posture; the index serves everything else.';

/** One tool as the protocol serves it — the name, the teaching, the grammar, the gesture. */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
  run(bridge: BridgeLike, args: Readonly<Record<string, unknown>>): Promise<unknown>;
}

/** The one gesture the protocol asks of a bridge: call a route. */
export interface BridgeLike {
  call(route: RouteCall): Promise<unknown>;
}

/** The stdio streams, injectable — tests speak the protocol in memory. */
export interface McpStreams {
  readonly input: AsyncIterable<Uint8Array | string>;
  readonly output: { write(data: string): void };
}

export interface McpServerOptions {
  readonly bridge: BridgeLike;
  readonly tools: readonly McpTool[];
  /** The package version — the caller owns it (the CLI reads package.json); absent answers 0.0.0. */
  readonly version?: string;
  /**
   * The eager probe (#22): liveness before speaking. Refuses → the
   * teaching lands on stderr and the session ends; nothing is answered.
   */
  readonly probe?: () => Promise<void>;
}

/**
 * Reads newline-delimited JSON-RPC from input, writes responses to
 * output, returns when input ends (the composition root ends the
 * process after this).
 */
export async function runMcpServer(streams: McpStreams, options: McpServerOptions): Promise<void> {
  if (options.probe !== undefined) {
    try {
      await options.probe();
    } catch (error) {
      process.stderr.write(
        `souvenance mcp refuses to speak: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return;
    }
  }
  const respond: Responder = (id, payload) => {
    const body =
      payload.error !== undefined
        ? { jsonrpc: '2.0', id, error: payload.error }
        : { jsonrpc: '2.0', id, result: payload.result };
    streams.output.write(JSON.stringify(body) + '\n');
  };
  let buffer = '';
  for await (const chunk of streams.input) {
    buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length === 0) continue;
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
        refuseLineCap(respond);
        return;
      }
      handleMessage(options, line, respond);
    }
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) {
      refuseLineCap(respond);
      return;
    }
  }
}

/**
 * Input cap — the largest single JSON-RPC line (10 MiB dwarfs any real
 * tool call, matching the HTTP body cap's generosity), measured in
 * UTF-8 bytes and judged on EVERY line: complete or unterminated tail.
 * A client streaming bytes without a newline must not grow the heap
 * without bound, and one giant terminated line must not ride either:
 * breach → one parse-error response and the session ends (a stream
 * that oversized its line is garbage by then). Complete lines are
 * processed in order before the tail check, so one giant chunk
 * carrying valid lines plus a huge tail still serves those lines.
 */
const MAX_LINE_BYTES = 10 * 1024 * 1024;

type Responder = (
  id: unknown,
  payload: { result?: unknown; error?: { code: number; message: string } },
) => void;

/** The one breach answer: a parse-error-shaped refusal, then the loop returns. */
function refuseLineCap(respond: Responder): void {
  respond(null, { error: { code: -32700, message: 'input line exceeds the 10 MiB cap' } });
}

/** Dispatches one protocol line. Notifications (`notifications/*`) are never
 *  responded to; every request gets exactly one response line. */
function handleMessage(options: McpServerOptions, line: string, respond: Responder): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    respond(null, { error: { code: -32700, message: 'Parse error' } });
    return;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    respond(null, { error: { code: -32600, message: 'Invalid Request' } });
    return;
  }
  const message = parsed as { method?: unknown; id?: unknown; params?: unknown };
  if (typeof message.method !== 'string') {
    if (message.id !== undefined)
      respond(message.id, { error: { code: -32600, message: 'Invalid Request' } });
    return;
  }
  if (message.method.startsWith('notifications/')) return;
  switch (message.method) {
    case 'initialize': {
      const params = (
        typeof message.params === 'object' && message.params !== null ? message.params : {}
      ) as Record<string, unknown>;
      const requested =
        typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : undefined;
      const protocolVersion =
        requested !== undefined && KNOWN_PROTOCOL_VERSIONS.has(requested)
          ? requested
          : PROTOCOL_VERSION;
      respond(message.id, {
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: options.version ?? '0.0.0' },
          instructions: INSTRUCTIONS,
        },
      });
      return;
    }
    case 'ping':
      respond(message.id, { result: {} });
      return;
    case 'tools/list':
      respond(message.id, {
        result: {
          tools: options.tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        },
      });
      return;
    case 'tools/call': {
      const params = (
        typeof message.params === 'object' && message.params !== null ? message.params : {}
      ) as Record<string, unknown>;
      const name = params['name'];
      const tool =
        typeof name === 'string'
          ? options.tools.find((candidate) => candidate.name === name)
          : undefined;
      if (!tool) {
        respond(message.id, {
          result: {
            content: [{ type: 'text', text: `unknown tool '${String(name)}'` }],
            isError: true,
          },
        });
        return;
      }
      const rawArgs = params['arguments'];
      const args =
        typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
          ? (rawArgs as Readonly<Record<string, unknown>>)
          : {};
      void tool
        .run(options.bridge, args)
        .then((result) => respond(message.id, { result: toolResult(result) }))
        .catch((error: unknown) => {
          // Every tool failure — the wire's teaching included — is a
          // tool-level result, never a protocol error. The BridgeError's
          // message IS the teaching (the envelope's, verbatim); anything
          // else keeps its internals on stderr and serves the opaque one.
          if (error instanceof BridgeError) {
            respond(message.id, {
              result: { content: [{ type: 'text', text: error.message }], isError: true },
            });
            return;
          }
          const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
          process.stderr.write(`internal error: ${detail}\n`);
          respond(message.id, {
            result: { content: [{ type: 'text', text: 'internal error' }], isError: true },
          });
        });
      return;
    }
    default:
      respond(message.id, {
        error: { code: -32601, message: `Method not found: ${message.method}` },
      });
  }
}

/**
 * The tool result's three shapes: a string IS text (the skills' body,
 * served verbatim — a markdown teaching never arrives JSON-quoted);
 * undefined was a 204 — nothing to say, an empty content array; anything
 * else is the JSON shape the route served, pretty-printed.
 */
function toolResult(result: unknown): { content: { type: 'text'; text: string }[] } {
  if (result === undefined) return { content: [] };
  if (typeof result === 'string') return { content: [{ type: 'text', text: result }] };
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
