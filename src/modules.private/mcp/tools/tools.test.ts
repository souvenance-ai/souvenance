/**
 * The tool table's integration pins (#22): the REAL bridge client, the
 * REAL protocol loop over in-memory streams, the REAL server
 * (`startServer` on an ephemeral loopback port with a seeded store).
 * What pins here is the mirror rule end to end: an MCP tool call rides
 * fetch to a route, the route's answer serves verbatim, and every
 * refusal arrives as a tool-level isError carrying the envelope's
 * teaching. The adversarial depth lives with the battery; this suite
 * pins the contract the table serves.
 */
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'vitest';
import type { StoreGrant } from '../../config/config.ts';
import { Store } from '../../store/store.ts';
import { Bridge } from '../bridge/bridge.ts';
import { runMcpServer } from '../mcp/mcp.ts';
import { startServer } from '../../server/serve/serve.ts';
import { TOOLS } from './tools.ts';
import { MAX_DEPTH, MAX_LIMIT } from '../../server/limits/limits.ts';
import { MAX_SUMMARY_LENGTH } from '../../store/store.ts';

const GRANT_RW: StoreGrant = {
  agent: 'mneme',
  secret: `souv-${'a'.repeat(32)}`,
  store: 'alpha',
  mode: 'rw',
};
const GRANT_RO: StoreGrant = {
  agent: 'reader',
  secret: `souv-${'b'.repeat(32)}`,
  store: 'alpha',
  mode: 'ro',
};

/** The full composition: a seeded store, the live server, the bridge, the loop. */
async function harness(
  options: { grants?: readonly StoreGrant[]; seed?: (store: Store) => void } = {},
): Promise<{
  call: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ isError?: boolean; result?: any; text: string }>;
  tools: () => Promise<{ name: string; description: string; inputSchema: { type: string } }[]>;
  close: () => Promise<void>;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'souvenance-mcp-tools-'));
  // The store file exists before the boot: the grant's store must exist
  // in the registry (#52's boot-time validation) — an empty store is a
  // valid one.
  const seeded = Store.open({ dbPath: join(dir, 'alpha.db') });
  try {
    options.seed?.(seeded);
  } finally {
    seeded.close();
  }
  const running = await startServer({
    port: 0,
    host: '127.0.0.1',
    storesDir: dir,
    version: 'test',
    tokens: options.grants ?? [GRANT_RW],
    management: [],
  });
  const bridge = new Bridge({
    url: `http://127.0.0.1:${running.port}`,
    token: (options.grants ?? [GRANT_RW])[0]!.secret,
  });
  const input = new PassThrough();
  const collected: string[] = [];
  const loop = runMcpServer(
    { input, output: { write: (data) => collected.push(data) } },
    { bridge, tools: TOOLS, probe: () => bridge.probe() },
  );
  let idCounter = 0;
  const rpc = async (lines: string[], expected: number): Promise<Record<string, any>[]> => {
    const before = collected.length;
    input.write(lines.join('\n') + '\n');
    const deadline = Date.now() + 5_000;
    while (collected.length < before + expected && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(collected.length, before + expected, 'expected responses did not arrive');
    return collected.slice(before).map((line) => JSON.parse(line) as Record<string, any>);
  };
  await rpc(
    [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    ],
    1,
  );
  return {
    call: async (name, args = {}) => {
      const id = ++idCounter;
      const responses = await rpc(
        [
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        ],
        1,
      );
      const response = responses[0] as {
        result: { content: { type: string; text: string }[]; isError?: boolean };
      };
      const content = response.result.content;
      const text = content[0]?.text;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined; // A string result (the skills' body) IS text — never JSON.
      }
      return {
        isError: response.result.isError,
        result: !response.result.isError ? parsed : undefined,
        text,
      };
    },
    tools: async () => {
      const responses = await rpc(
        [JSON.stringify({ jsonrpc: '2.0', id: ++idCounter, method: 'tools/list' })],
        1,
      );
      return (responses[0] as { result: { tools: any[] } }).result.tools;
    },
    close: async () => {
      input.end();
      await loop;
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('the tool table over the live server', () => {
  let h: Awaited<ReturnType<typeof harness>> | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('tools/list serves the thirteen tools — twelve data verbs plus the orientation door', async () => {
    h = await harness();
    const tools = await h.tools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'checkin',
        'checkout',
        'store',
        'supersede',
        'merge',
        'link',
        'unlink',
        'deprecate',
        'setHot',
        'get',
        'list',
        'search',
        'skills',
      ],
    );
    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, 'object');
      assert.ok(tool.description.length > 0);
    }
  });

  it('the arc: store, get, list with paging, search with a metadata filter', async () => {
    h = await harness({
      seed: (store) => {
        store.store('seeded one', { kind: 'note', summary: 'the first seed' });
        store.store('seeded two', { kind: 'decision', summary: 'the second seed' });
      },
    });
    const stored = await h.call('store', {
      content: 'The user prefers tabs over spaces',
      kind: 'preference',
      metadata: { topic: 'editorial' },
    });
    const id = stored.result?.id as string;
    assert.match(id, /^[0-9a-f-]{36}$/);

    const gotten = await h.call('get', { id });
    assert.equal(gotten.result?.content, 'The user prefers tabs over spaces');
    assert.equal(gotten.result?.kind, 'preference');
    assert.equal(gotten.result?.status, 'active');
    assert.deepEqual(gotten.result?.relations, { out: [], in: [] });

    const listed = await h.call('list', {});
    assert.equal(listed.result?.memories.length, 3);
    assert.equal(listed.result?.next_after, null);
    const page = await h.call('list', { limit: 1 });
    assert.equal(page.result?.memories.length, 1);
    const paged = await h.call('list', { after: page.result?.next_after });
    assert.equal(paged.result?.memories.length, 2);
    const filtered = await h.call('list', { metadata: { topic: 'editorial' } });
    assert.deepEqual(
      filtered.result?.memories.map((memory: { id: string }) => memory.id),
      [id],
    );
    const kinds = await h.call('list', { kind: ['note', 'preference'] });
    assert.ok(
      kinds.result?.memories.every((memory: { kind: string }) =>
        ['note', 'preference'].includes(memory.kind),
      ),
    );

    const found = await h.call('search', { q: 'tabs' });
    assert.equal(found.result?.length, 1);
    assert.equal(found.result?.[0]?.id, id);
    assert.equal(typeof found.result?.[0]?.rank, 'number');
  });

  it('one-gesture relations and the hot birth; checkin serves the block and the stats', async () => {
    h = await harness();
    const target = await h.call('store', { content: 'the referenced decision', kind: 'decision' });
    const born = await h.call('store', {
      content: 'born hot, born linked',
      kind: 'note',
      metadata: { topic: 'birth' },
      relations: [{ to: target.result?.id as string, kind: 'references' }],
      hot: true,
    });
    const hotId = born.result?.id as string;
    const projection = await h.call('get', { id: hotId });
    assert.equal(projection.result?.status, 'hot');
    assert.equal(projection.result?.relations.out.length, 1);
    assert.equal(projection.result?.relations.out[0]?.kind, 'references');
    assert.equal(projection.result?.relations.out[0]?.to_id, target.result?.id);

    const opened = await h.call('checkin', {});
    assert.ok(opened.result?.hot.some((memory: { id: string }) => memory.id === hotId));
    assert.equal(typeof opened.result?.stats.memories, 'number');
  });

  it('the lifecycle: supersede inherits, merge fuses, deprecate retires, setHot flips', async () => {
    h = await harness();
    const a = (await h.call('store', { content: 'decision A', kind: 'decision' })).result
      ?.id as string;
    const b = (await h.call('store', { content: 'decision B', kind: 'decision' })).result
      ?.id as string;
    const linked = await h.call('link', { id: b, to: a, kind: 'references' });
    assert.deepEqual(linked.result, { from_id: b, to_id: a, kind: 'references' });

    const successor = (await h.call('supersede', { id: a, content: 'decision A revised' })).result
      ?.id as string;
    const old = await h.call('get', { id: a });
    assert.equal(old.result?.status, 'superseded');
    assert.equal(old.result?.relations.out[0]?.kind, 'supersedes');
    assert.equal(old.result?.relations.out[0]?.to_id, successor);

    const fused = (
      await h.call('merge', { ids: [successor, b], content: 'the fusion', kind: 'decision' })
    ).result?.id as string;
    assert.match(fused, /^[0-9a-f-]{36}$/);
    assert.equal((await h.call('get', { id: b })).result?.status, 'merged');

    const cooled = await h.call('setHot', { id: fused, hot: true });
    assert.equal(cooled.text, undefined);
    const opened = await h.call('checkin', {});
    assert.ok(opened.result?.hot.some((memory: { id: string }) => memory.id === fused));
    await h.call('setHot', { id: fused, hot: false });

    const retired = await h.call('deprecate', { id: fused });
    assert.equal(retired.text, undefined);
    assert.equal((await h.call('get', { id: fused })).result?.status, 'deprecated');
  });

  it('the checkout verdict answers the closing posture', async () => {
    h = await harness();
    await h.call('store', { content: 'a hot line for the future', kind: 'note' });
    await h.call('setHot', {
      id: (await h.call('search', { q: 'future' })).result?.[0]?.id,
      hot: true,
    });
    const verdict = await h.call('checkout', {});
    assert.equal(typeof verdict.result?.healthy, 'boolean');
    assert.ok(Array.isArray(verdict.result?.findings));
  });

  it("every refusal teaches through isError — the wire's envelope, verbatim", async () => {
    h = await harness();
    const ghost = '00000000-0000-4000-8000-000000000005';
    const unknown = await h.call('get', { id: ghost });
    assert.equal(unknown.isError, true);
    assert.equal(unknown.text, `memory not found: ${ghost}`);

    const kindless = await h.call('store', { content: 'no kind declared' });
    assert.equal(kindless.isError, true);
    assert.match(kindless.text ?? '', /kind/);

    const legacyIdiom = await h.call('store', { content: 'x', kind: 'note', weight: 0.9 });
    assert.equal(legacyIdiom.isError, true);
    assert.match(legacyIdiom.text ?? '', /weight/);

    const ghostSkill = await h.call('skills', { name: 'nope' });
    assert.equal(ghostSkill.isError, true);
    assert.equal(ghostSkill.text, 'no such skill — the index serves at /skills');

    // The legacy delete idiom's tombstone: an authored key the tool table
    // does not know still RIDES, and the wire's strict grammar refuses it
    // by name — a silently-dropped field would be a lie (#60, held at the
    // bridge).
    const legacyForce = await h.call('deprecate', { id: ghost, force: true });
    assert.equal(legacyForce.isError, true);
    assert.match(legacyForce.text ?? '', /force/);
  });

  it('a read-only grant reads but never writes; a foreign bearer refuses at the door', async () => {
    h = await harness({
      grants: [GRANT_RO],
      seed: (store) => {
        store.store('the seeded register', { kind: 'note' });
      },
    });
    const listed = await h.call('list', {});
    assert.equal(listed.result?.memories.length, 1);
    const refused = await h.call('store', { content: 'x', kind: 'note' });
    assert.equal(refused.isError, true);
    assert.ok(refused.text !== undefined && refused.text.length > 0);
  });

  it('the skills door: the index heads with waking, the body serves verbatim', async () => {
    h = await harness();
    const index = await h.call('skills', {});
    assert.equal(index.result?.version, 'test');
    assert.equal(index.result?.skills[0]?.name, 'waking');
    assert.ok(index.result?.skills.some((skill: { name: string }) => skill.name === 'setup'));

    const body = await h.call('skills', { name: 'waking' });
    assert.equal(body.isError, undefined);
    assert.match(body.text ?? '', /^---/);
    assert.match(body.text ?? '', /checkin/);
  });
});

describe('the declared bounds ride the caps', () => {
  it("the bridge teaches the caps' current values — a ceiling change cannot leave a dead number", () => {
    const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
    const bound = (tool: string, property: string): number | undefined => {
      const shape = byName.get(tool)?.inputSchema.properties[property] as
        { readonly maximum?: number; readonly maxLength?: number } | undefined;
      return shape?.maximum ?? shape?.maxLength;
    };
    assert.equal(bound('list', 'limit'), MAX_LIMIT);
    assert.equal(bound('search', 'limit'), MAX_LIMIT);
    assert.equal(bound('get', 'depth'), MAX_DEPTH);
    assert.equal(bound('store', 'summary'), MAX_SUMMARY_LENGTH);
    assert.equal(bound('supersede', 'summary'), MAX_SUMMARY_LENGTH);
    assert.equal(bound('merge', 'summary'), MAX_SUMMARY_LENGTH);
  });
});
