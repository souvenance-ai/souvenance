/**
 * The protocol loop's pins (#22) — the legacy suite converted to vitest
 * and re-anchored: the tool table here is a stub (the real 13-tool table
 * pins itself in tools/tools.test.ts against the live server), the
 * bridge is a stub, the streams are in-memory. What pins here is the
 * protocol: the initialize family, tools/list pass-through, the
 * tools/call result shapes (JSON, string verbatim, the empty 204), the
 * tool-level error family, the refusals, the cap, and the eager probe.
 */
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { afterEach, describe, it, vi } from 'vitest';
import { BridgeError } from '../bridge/bridge.ts';
import { runMcpServer, type McpEnding, type McpTool, type McpServerOptions } from './mcp.ts';

/** One JSON-RPC response as the tests read it — `result` stays loose on purpose. */
interface TestResponse {
  readonly id?: unknown;
  readonly result?: any;
  readonly error?: { readonly code: number; readonly message: string };
}

/** In-memory rig: an input stream, collected output lines, an rpc helper. */
function rig(options?: Partial<McpServerOptions>): {
  rpc: (lines: string[], expected: number) => Promise<TestResponse[]>;
  close: () => Promise<void>;
} {
  const input = new PassThrough();
  const collected: string[] = [];
  const running = runMcpServer(
    { input, output: { write: (data) => collected.push(data) } },
    {
      bridge: { call: async () => undefined },
      tools: [],
      ...options,
    },
  );
  return {
    rpc: async (lines, expected) => {
      const before = collected.length;
      input.write(lines.join('\n') + '\n');
      const deadline = Date.now() + 5_000;
      while (collected.length < before + expected && Date.now() < deadline) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(collected.length, before + expected, 'expected responses did not arrive');
      return collected.slice(before).map((line) => JSON.parse(line) as TestResponse);
    },
    close: async () => {
      input.end();
      await running;
    },
  };
}

const INIT = JSON.stringify({
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18' },
});
const READY = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });

/** One tools/call against a stub table; returns the parsed payload or the error text. */
async function call(
  session: ReturnType<typeof rig>,
  name: string,
  args: Record<string, unknown> = {},
  id = 1,
): Promise<{ isError?: boolean; result?: any; text: string }> {
  const responses = await session.rpc(
    [
      INIT,
      READY,
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    ],
    2,
  );
  const response = responses.find((x) => x.id === id);
  assert.ok(response, `no response for id ${id}`);
  const result = response.result;
  assert.ok(Array.isArray(result.content) && result.content[0].type === 'text');
  const text = result.content[0].text as string;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined; // A string result IS text — never JSON.
  }
  return { isError: result.isError, result: result.isError ? undefined : parsed, text };
}

describe('runMcpServer', () => {
  let rigToClose: ReturnType<typeof rig> | undefined;
  afterEach(async () => {
    await rigToClose?.close();
    rigToClose = undefined;
    vi.restoreAllMocks();
  });

  function take(session: ReturnType<typeof rig>): ReturnType<typeof rig> {
    rigToClose = session;
    return session;
  }

  it('initialize echoes a known protocolVersion and carries serverInfo + instructions', async () => {
    const session = take(rig());
    const [response] = await session.rpc([INIT], 1);
    assert.equal(response.id, 0);
    assert.equal(response.result.protocolVersion, '2025-06-18');
    assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
    assert.equal(response.result.serverInfo.name, 'souvenance');
    assert.match(response.result.instructions as string, /checkin FIRST/);
    assert.match(response.result.instructions as string, /skills with name "waking"/);
  });

  it('initialize echoes an older requested revision, falls back on unknown ones', async () => {
    const session = take(rig());
    const [older] = await session.rpc(
      [
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-03-26' },
        }),
      ],
      1,
    );
    assert.equal(older.result.protocolVersion, '2025-03-26');
    const [fallback] = await session.rpc(
      [
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: { protocolVersion: '1999-01-01' },
        }),
      ],
      1,
    );
    assert.equal(fallback.result.protocolVersion, '2025-06-18');
  });

  it("the version is the caller's — absent answers 0.0.0, present flows to serverInfo", async () => {
    const session = take(rig({ version: '0.2.0-test' }));
    const [response] = await session.rpc([INIT], 1);
    assert.equal(response.result.serverInfo.version, '0.2.0-test');
    const bare = take(rig());
    const [plain] = await bare.rpc([INIT], 1);
    assert.equal(plain.result.serverInfo.version, '0.0.0');
  });

  it('tools/list serves the table it is given — names, teaching, one schema each', async () => {
    const stubTool: McpTool = {
      name: 'store',
      description: 'author a memory',
      inputSchema: {
        type: 'object',
        properties: { content: { type: 'string' } },
        required: ['content'],
      },
      run: async () => undefined,
    };
    const session = take(rig({ tools: [stubTool] }));
    const [response] = await session.rpc(
      [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })],
      1,
    );
    const tools = response.result.tools as {
      name: string;
      description: string;
      inputSchema: { type: string };
    }[];
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['store'],
    );
    assert.equal(tools[0]?.inputSchema.type, 'object');
  });

  it('tools/call: a JSON result serves pretty-printed, a string serves verbatim, a 204 serves empty', async () => {
    const stubTool: McpTool = {
      name: 'shapes',
      description: 'the three result shapes',
      inputSchema: { type: 'object', properties: {} },
      run: async (_bridge, args) => {
        if (args['shape'] === 'string') return 'the body verbatim';
        if (args['shape'] === 'empty') return undefined;
        return { id: 'id-1' };
      },
    };
    const session = take(rig({ tools: [stubTool] }));
    const json = await call(session, 'shapes', { shape: 'json' });
    assert.deepEqual(json.result, { id: 'id-1' });
    assert.match(json.text, /^\{\n  "id": "id-1"\n\}$/);
    const raw = await call(session, 'shapes', { shape: 'string' }, 2);
    assert.equal(raw.text, 'the body verbatim');
    assert.equal(raw.isError, undefined);
    const empty = await session.rpc(
      [
        INIT,
        READY,
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'shapes', arguments: { shape: 'empty' } },
        }),
      ],
      2,
    );
    const answered = empty.find((x) => x.id === 3);
    assert.deepEqual(answered?.result.content, []);
  });

  it('a BridgeError lands as isError with its message verbatim; a foreign error stays opaque', async () => {
    const teaching = new BridgeError('memory not found: id-1');
    const stubTool: McpTool = {
      name: 'moody',
      description: 'fails on demand',
      inputSchema: { type: 'object', properties: {} },
      run: async (_bridge, args) => {
        if (args['kind'] === 'opaque') throw new Error('the raw sqlite internals');
        throw teaching;
      },
    };
    const session = take(rig({ tools: [stubTool] }));
    const taught = await call(session, 'moody', {}, 1);
    assert.equal(taught.isError, true);
    assert.equal(taught.text, 'memory not found: id-1');
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const opaque = await call(session, 'moody', { kind: 'opaque' }, 2);
    assert.equal(opaque.isError, true);
    assert.equal(opaque.text, 'internal error');
    assert.ok(
      stderr.mock.calls.some((args) => String(args[0]).includes('the raw sqlite internals')),
    );
  });

  it('an unknown tool answers isError naming it — never a protocol error', async () => {
    const session = take(rig());
    const responses = await session.rpc(
      [
        INIT,
        READY,
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nosuch' } }),
      ],
      2,
    );
    const response = responses.find((x) => x.id === 1);
    assert.equal(response?.result.isError, true);
    assert.match(response?.result.content[0].text as string, /unknown tool 'nosuch'/);
  });

  it('the protocol family: ping, parse error, invalid request, unknown method, silent notifications', async () => {
    const session = take(rig());
    const responses = await session.rpc(
      [
        'not json at all',
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
          params: { requestId: 9 },
        }),
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'wat/unknown' }),
      ],
      3,
    );
    assert.equal(responses[0]?.id, null);
    assert.equal((responses[0]?.error as { code: number }).code, -32700);
    assert.equal(responses[1]?.id, 1);
    assert.deepEqual(responses[1]?.result, {});
    assert.equal(responses[2]?.id, 2);
    assert.equal((responses[2]?.error as { code: number }).code, -32601);
  });

  it('an unterminated line past the 10 MiB cap refuses once and ends the session', async () => {
    // The cap: one giant unterminated chunk → exactly one refusal, then the loop ends.
    const { responses, ending } = await writeRawAndCollect('a'.repeat(10 * 1024 * 1024 + 1));
    assert.equal(ending, 'session-ended');
    assert.equal(responses.length, 1);
    const parsed = JSON.parse(responses[0] ?? '') as {
      id: null;
      error: { code: number; message: string };
    };
    assert.equal(parsed.id, null);
    assert.equal(parsed.error.code, -32700);
    assert.match(parsed.error.message, /10 MiB cap/);
  });

  it('a terminated line past the 10 MiB cap refuses too — the cap judges every line', async () => {
    const { responses, ending } = await writeRawAndCollect('b'.repeat(10 * 1024 * 1024 + 1) + '\n');
    assert.equal(ending, 'session-ended');
    assert.equal(responses.length, 1);
    const parsed = JSON.parse(responses[0] ?? '') as {
      id: null;
      error: { code: number; message: string };
    };
    assert.equal(parsed.id, null);
    assert.equal(parsed.error.code, -32700);
    assert.match(parsed.error.message, /10 MiB cap/);
  });

  async function writeRawAndCollect(chunk: string): Promise<{
    responses: string[];
    ending: McpEnding;
  }> {
    const input = new PassThrough();
    const collected: string[] = [];
    const running = runMcpServer(
      { input, output: { write: (data) => collected.push(data) } },
      { bridge: { call: async () => undefined }, tools: [] },
    );
    input.write(chunk);
    input.end();
    const ending = await running;
    return { responses: collected, ending };
  }

  it('a refusing probe ends the session before speaking — the teaching lands on stderr', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const input = new PassThrough();
    const collected: string[] = [];
    const ending = await runMcpServer(
      { input, output: { write: (data) => collected.push(data) } },
      {
        bridge: { call: async () => undefined },
        tools: [],
        probe: async () => {
          throw new BridgeError('the server at http://127.0.0.1:3141 is not reachable');
        },
      },
    );
    input.write(INIT + '\n');
    input.end();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ending, 'probe-refused', 'the composition root learns the probe refused');
    assert.equal(collected.length, 0, 'nothing was answered — the bridge never spoke');
    assert.ok(stderr.mock.calls.some((args) => String(args[0]).includes('refuses to speak')));
    assert.ok(stderr.mock.calls.some((args) => String(args[0]).includes('is not reachable')));
  });

  it("a passing probe serves — the eager posture is the composition's, the refusal the loop's", async () => {
    let probed = false;
    const session = take(
      rig({
        probe: async () => {
          probed = true;
        },
      }),
    );
    await session.rpc([INIT], 1);
    assert.ok(probed);
  });
});
