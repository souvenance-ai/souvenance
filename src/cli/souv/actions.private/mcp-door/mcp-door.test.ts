/**
 * The bin door's pins, the bin spawned as the composition ships it:
 * the protocol served over the real wire (initialize, tools/list, one
 * tool call landing the memory), a clean end at exit 0 — and the two
 * refusals silent on stdout (the MCP client parses it byte-for-byte):
 * the binding's absence at 78, the probe's refusal at 1.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'vitest';
import {
  bootTestWire,
  type TestWire,
} from '../../../../modules.private/cli/test-wire/test-wire.ts';

const REPO = process.cwd();

/** The environment the MCP client would inject — the grant carries the store. */
function bound(wire: TestWire): Record<string, string | undefined> {
  return {
    ...process.env,
    SOUVENANCE_URL: wire.store.url,
    SOUVENANCE_TOKEN: wire.store.token,
  };
}

interface McpChild {
  rpc(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<{ code: number | null; stdout: string; stderr: string }>;
}

/** The door as a subprocess — one JSON-RPC line per rpc, the response matched by id. */
function openMcp(environment: Record<string, string | undefined>): Promise<McpChild> {
  return new Promise((resolve) => {
    const child = spawn('node', ['src/cli/souv/cli.ts', 'mcp'], {
      cwd: REPO,
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stdout = '';
    let stderr = '';
    const waiters = new Map<number, (document: Record<string, unknown>) => void>();
    let nextId = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdout += text;
      buffer += text;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          parsed = undefined;
        }
        if (typeof parsed === 'object' && parsed !== null) {
          const document = parsed as { id?: unknown };
          const id = typeof document.id === 'number' ? document.id : undefined;
          if (id !== undefined) {
            const waiter = waiters.get(id);
            if (waiter !== undefined) {
              waiters.delete(id);
              waiter(document);
            }
          }
        }
        newline = buffer.indexOf('\n');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    resolve({
      rpc(method, params = {}) {
        const id = ++nextId;
        return new Promise((settle) => {
          waiters.set(id, settle);
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        });
      },
      close() {
        child.stdin.end();
        return new Promise((settle) => {
          child.on('close', (code) => settle({ code, stdout, stderr }));
        });
      },
    });
  });
}

async function closeOnly(environment: Record<string, string | undefined>): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  const session = await openMcp(environment);
  return session.close();
}

test('the door serves the protocol over the real wire — and ends clean', async () => {
  const wire = await bootTestWire();
  try {
    const session = await openMcp(bound(wire));
    const hello = await session.rpc('initialize', { protocolVersion: '2025-06-18' });
    const result = hello['result'] as {
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      instructions: string;
    };
    assert.equal(result.protocolVersion, '2025-06-18');
    assert.equal(result.serverInfo.name, 'souvenance');
    assert.equal(result.serverInfo.version, '0.2.0');
    assert.match(result.instructions, /checkin FIRST/);
    const listing = await session.rpc('tools/list');
    const names = (listing['result'] as { tools: { name: string }[] }).tools.map(
      (tool) => tool.name,
    );
    assert.equal(names.length, 13);
    assert.ok(names.includes('checkin') && names.includes('skills'));
    const ping = await session.rpc('ping');
    assert.deepEqual(ping['result'], {});
    const stored = await session.rpc('tools/call', {
      name: 'store',
      arguments: { content: 'the door\u2019s own memory', kind: 'note' },
    });
    const content = (stored['result'] as { content: { text: string }[] }).content;
    const served = JSON.parse(content[0]?.text ?? '') as { id: string };
    assert.match(served.id, /^[0-9a-f-]{36}$/);
    const closing = await session.close();
    assert.equal(closing.code, 0);
  } finally {
    await wire.close();
  }
});

test('the door refuses bindingless — the teaching on stderr, exit 78, stdout silent', async () => {
  const environment = { ...process.env };
  delete environment['SOUVENANCE_URL'];
  delete environment['SOUVENANCE_TOKEN'];
  const closing = await closeOnly(environment);
  assert.equal(closing.code, 78);
  assert.equal(closing.stdout, '', 'stdout is protocol-only — a stray envelope corrupts it');
  assert.match(closing.stderr, /SOUVENANCE_TOKEN is absent/);
});

test('the door refuses an unreachable server — the probe\u2019s teaching, exit 1, stdout silent', async () => {
  const closing = await closeOnly({
    ...process.env,
    SOUVENANCE_URL: 'http://127.0.0.1:1',
    SOUVENANCE_TOKEN: `souv-${'a'.repeat(32)}`,
  });
  assert.equal(closing.code, 1);
  assert.equal(closing.stdout, '', 'stdout is protocol-only — a stray envelope corrupts it');
  assert.match(closing.stderr, /not reachable/);
});
