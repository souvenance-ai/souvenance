/**
 * The bridge client's pins (#22): the envelope mapping, the
 * reachability teaching, and the eager probe — driven against a stub
 * HTTP server whose canned answers are the wire's shapes, so the pins
 * read against real responses, never against mocks of our own code.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'vitest';
import { Bridge, BridgeError, type RouteCall } from './bridge.ts';

/** One canned answer per request; the server records what it received. */
interface Stub {
  url: string;
  readonly requests: { path: string; method: string; authorization?: string; body?: string }[];
  close(): Promise<void>;
  answer(status: number, body: string, contentType?: string): void;
}

async function stub(answerWith: {
  status: number;
  body: string;
  contentType?: string;
}): Promise<Stub> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      stubbed.requests.push({
        path: request.url ?? '',
        method: request.method ?? '',
        authorization: request.headers.authorization,
        body: body.length > 0 ? body : undefined,
      });
      response.writeHead(answerWith.status, {
        'content-type': answerWith.contentType ?? 'application/json',
      });
      response.end(answerWith.body);
    });
  });
  const closeServer = server.close.bind(server);
  const stubbed = Object.assign(server, {
    requests: [] as Stub['requests'],
    close: () => new Promise<void>((resolve) => closeServer(() => resolve())),
    answer: (status: number, body: string, contentType?: string) => {
      answerWith.status = status;
      answerWith.body = body;
      answerWith.contentType = contentType;
    },
  }) as Stub & Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  stubbed.url = `http://127.0.0.1:${port}`;
  return stubbed;
}

const TOKEN = 'souv-' + 'a'.repeat(32);

describe('Bridge', () => {
  let server: Stub;
  let bridge: Bridge;

  afterEach(async () => {
    await server?.close();
  });

  it('the probe resolves on a live /healthz and refuses anything else', async () => {
    server = await stub({ status: 200, body: JSON.stringify({ ok: true }) });
    bridge = new Bridge({ url: server.url, token: TOKEN });
    await bridge.probe();

    server.answer(404, JSON.stringify({ error: 'no such route' }));
    await assert.rejects(
      () => bridge.probe(),
      (error: unknown) => {
        assert.ok(error instanceof BridgeError);
        assert.match(error.message, /points at something that is not a souvenance server/);
        return true;
      },
    );
  });

  it('an unreachable server answers the reachability teaching — probe and call', async () => {
    // A port nothing listens on: the TCP dial itself fails.
    const dead = new Bridge({ url: 'http://127.0.0.1:1', token: TOKEN });
    await assert.rejects(
      () => dead.probe(),
      (error: unknown) => {
        assert.ok(error instanceof BridgeError);
        assert.match(error.message, /is not reachable/);
        assert.match(error.message, /souvenance serve/);
        return true;
      },
    );
    await assert.rejects(
      () => dead.call({ method: 'GET', path: '/memories' }),
      (error: unknown) => {
        assert.ok(error instanceof BridgeError);
        assert.match(error.message, /is not reachable/);
        return true;
      },
    );
  });

  it('a call rides the Bearer, the path and the query; the JSON answer parses', async () => {
    server = await stub({
      status: 200,
      body: JSON.stringify({ memories: [], next_after: null }),
    });
    bridge = new Bridge({ url: server.url, token: TOKEN });
    const query = new URLSearchParams({ limit: '5' });
    query.append('kind', 'note');
    query.append('kind', 'decision');
    const served = (await bridge.call({ method: 'GET', path: '/memories', query })) as {
      memories: unknown[];
      next_after: string | null;
    };
    assert.deepEqual(served, { memories: [], next_after: null });
    assert.equal(server.requests[0]?.path, '/memories?limit=5&kind=note&kind=decision');
    assert.equal(server.requests[0]?.method, 'GET');
    assert.equal(server.requests[0]?.authorization, `Bearer ${TOKEN}`);
  });

  it('a body rides as JSON with the content type; 204 answers undefined', async () => {
    server = await stub({ status: 201, body: JSON.stringify({ id: 'id-1' }) });
    bridge = new Bridge({ url: server.url, token: TOKEN });
    const route: RouteCall = {
      method: 'POST',
      path: '/memories',
      body: { content: 'x', kind: 'note' },
    };
    assert.deepEqual(await bridge.call(route), { id: 'id-1' });
    assert.equal(server.requests[0]?.body, JSON.stringify({ content: 'x', kind: 'note' }));

    server.answer(204, '');
    assert.equal(await bridge.call({ method: 'POST', path: '/memories/x/deprecate' }), undefined);
  });

  it('a text answer serves verbatim — the skills body is a string, not a JSON shape', async () => {
    server = await stub({
      status: 200,
      body: '---\nname: waking\n---\nbody',
      contentType: 'text/markdown; charset=utf-8',
    });
    bridge = new Bridge({ url: server.url, token: TOKEN });
    assert.equal(
      await bridge.call({ method: 'GET', path: '/skills/waking' }),
      '---\nname: waking\n---\nbody',
    );
  });

  it('every refusal throws with the envelope message verbatim — the bridge invents nothing', async () => {
    server = await stub({ status: 404, body: JSON.stringify({ error: 'memory not found: id-1' }) });
    bridge = new Bridge({ url: server.url, token: TOKEN });
    await assert.rejects(
      () => bridge.call({ method: 'GET', path: '/memories/id-1' }),
      (error: unknown) => {
        assert.ok(error instanceof BridgeError);
        assert.equal(error.message, 'memory not found: id-1');
        return true;
      },
    );

    server.answer(
      401,
      JSON.stringify({ error: 'the bearer is not ours — a store grant answers the data routes' }),
    );
    await assert.rejects(
      () => bridge.call({ method: 'GET', path: '/memories' }),
      (error: unknown) => {
        assert.ok(error instanceof BridgeError);
        assert.equal(
          error.message,
          'the bearer is not ours — a store grant answers the data routes',
        );
        return true;
      },
    );

    server.answer(405, '405 Method Not Allowed', 'text/plain');
    await assert.rejects(
      () => bridge.call({ method: 'POST', path: '/memories' }),
      (error: unknown) => {
        assert.ok(error instanceof BridgeError);
        assert.match(error.message, /answered 405 without its envelope/);
        return true;
      },
    );
  });

  it('the server dying mid-session answers the reachability teaching — the mirror rule holds', async () => {
    server = await stub({ status: 200, body: JSON.stringify({ ok: true }) });
    bridge = new Bridge({ url: server.url, token: TOKEN });
    await bridge.probe();
    await server.close();
    await assert.rejects(
      () => bridge.call({ method: 'GET', path: '/memories' }),
      (error: unknown) => {
        assert.ok(error instanceof BridgeError);
        assert.match(error.message, /is not reachable/);
        return true;
      },
    );
  });
});
