import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test, vi } from 'vitest';
import { bootTestWire } from '../test-wire/test-wire.ts';
import { httpCall, REQUEST_DEADLINE_MS } from './http-call.ts';

type RawServer = Server;

/** One plain HTTP server on an ephemeral port — the client-mechanics fixtures. */
async function listen(
  serve: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => void,
): Promise<{ server: RawServer; url: string }> {
  const server = createServer(serve);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: RawServer): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test('the wire\u2019s answer is served verbatim — one JSON document, parsed', async () => {
  const wire = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const answer = await httpCall(
      { url: wire.url, token: 'souv-x' },
      { method: 'get', path: '/healthz' },
    );
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.document, { ok: true });
  } finally {
    await closeServer(wire.server);
  }
});

test('the Bearer rides — the real wire serves the authed read', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await httpCall(wire.store, { method: 'get', path: '/memories' });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.document, { memories: [], next_after: null });
  } finally {
    await wire.close();
  }
});

test('a foreign token refuses — the envelope verbatim', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await httpCall(
      { url: wire.store.url, token: `souv-${'c'.repeat(32)}` },
      { method: 'get', path: '/memories' },
    );
    assert.equal(answer.status, 401);
    assert.ok(
      typeof (answer.document as { error?: unknown })?.error === 'string' &&
        (answer.document as { error: string }).error.length > 0,
      'the envelope teaches',
    );
  } finally {
    await wire.close();
  }
});

test('the wire\u2019s refusal is served verbatim — the strict body\u2019s 400', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await httpCall(wire.store, { method: 'post', path: '/memories', body: {} });
    assert.equal(answer.status, 400);
    assert.ok(typeof (answer.document as { error?: unknown })?.error === 'string');
  } finally {
    await wire.close();
  }
});

test('204 — nothing to say, nothing served', async () => {
  const wire = await bootTestWire();
  try {
    const birth = await httpCall(wire.management, {
      method: 'post',
      path: '/stores',
      body: { name: 'ephemeral' },
    });
    assert.equal(birth.status, 201);
    const answer = await httpCall(wire.management, {
      method: 'delete',
      path: '/stores/ephemeral',
    });
    assert.equal(answer.status, 204);
    assert.equal(answer.document, undefined);
  } finally {
    await wire.close();
  }
});

test('a body that is not ours is wrapped — the status named, the verdict the client\u2019s', async () => {
  const wire = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>hello</html>');
  });
  try {
    const answer = await httpCall({ url: wire.url, token: 'souv-x' }, { method: 'get', path: '/' });
    assert.equal(answer.status, 0);
    assert.match(
      String((answer.document as { error: string }).error),
      /answered 200 with a body that is not one JSON document/,
    );
  } finally {
    await closeServer(wire.server);
  }
});

test('a closed port teaches the boot — the reachability refusal, exit-1 class', async () => {
  const wire = await listen(() => undefined);
  const url = wire.url;
  await closeServer(wire.server);
  const answer = await httpCall({ url, token: 'souv-x' }, { method: 'get', path: '/memories' });
  assert.equal(answer.status, 0);
  assert.match(
    String((answer.document as { error: string }).error),
    /not reachable.*boot it: souvenance serve/s,
  );
});

test('a dribbling server dies at the deadline — the verdict is absolute over headers, the connection freed', async () => {
  // Partial headers, forever (the probe's fixture): the status line
  // lands once, then one byte per heartbeat extends a header that never
  // sees its CR LF terminator — the parser stays content and incomplete.
  let signalArrived: () => void = () => {};
  const requestArrived = new Promise<void>((resolve) => {
    signalArrived = resolve;
  });
  let signalClosed: () => void = () => {};
  const connectionClosed = new Promise<void>((resolve) => {
    signalClosed = resolve;
  });
  const server = createServer((_req, res) => {
    signalArrived();
    const socket = res.socket;
    socket?.write('HTTP/1.1 200 OK\r\n');
    const dribble = setInterval(() => socket?.write('x'), 200);
    socket?.once('close', () => {
      clearInterval(dribble);
      signalClosed();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  try {
    const binding = { url: `http://127.0.0.1:${address.port}`, token: 'souv-x' };
    // The deadline is 30 s of wall clock — the judge is moved to its
    // firing, the real socket IO keeps flowing (fake timers own only
    // the clocks). The request's arrival is awaited FIRST: the clock
    // never moves before the server holds the connection — a pre-connect
    // destroy would leave the handler unrun and the close unobserved.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = httpCall(binding, { method: 'get', path: '/memories' });
    await requestArrived;
    const answer = await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS).then(() => pending);
    assert.equal(answer.status, 0);
    assert.match(
      String((answer.document as { error: string }).error),
      new RegExp(`did not answer within ${REQUEST_DEADLINE_MS / 1000} s`),
    );
    // The settle tore the connection down: the server observes its
    // close promptly, on the real clock (the leaked-promise race names
    // a settle that freed nothing).
    vi.useRealTimers();
    const closed = await Promise.race([
      connectionClosed.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    assert.equal(closed, true, 'the settle must free the connection');
  } finally {
    vi.useRealTimers();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a never-ending body dies at the deadline too — the absolute judge covers the body', async () => {
  // Headers complete once, body forever: the message closes only with
  // its connection. The client reads the body chunks — the deadline is
  // still the judge, and the settle frees the socket. The request's
  // arrival is awaited before the clock moves (the close listener lives
  // in the server's handler).
  let signalArrived: () => void = () => {};
  const requestArrived = new Promise<void>((resolve) => {
    signalArrived = resolve;
  });
  let signalClosed: () => void = () => {};
  const connectionClosed = new Promise<void>((resolve) => {
    signalClosed = resolve;
  });
  const server = createServer((_req, res) => {
    signalArrived();
    const socket = res.socket;
    socket?.write('HTTP/1.1 200 OK\r\n\r\n');
    const stream = setInterval(() => socket?.write('x'), 200);
    socket?.once('close', () => {
      clearInterval(stream);
      signalClosed();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  try {
    const binding = { url: `http://127.0.0.1:${address.port}`, token: 'souv-x' };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = httpCall(binding, { method: 'get', path: '/memories' });
    await requestArrived;
    const answer = await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS).then(() => pending);
    assert.equal(answer.status, 0);
    assert.match(
      String((answer.document as { error: string }).error),
      new RegExp(`did not answer within ${REQUEST_DEADLINE_MS / 1000} s`),
    );
    vi.useRealTimers();
    const closed = await Promise.race([
      connectionClosed.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    assert.equal(closed, true, 'the settle must free the connection');
  } finally {
    vi.useRealTimers();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
