import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { test, vi } from 'vitest';
import { bootTestWire } from '../test-wire/test-wire.ts';
import { httpCall } from './http-call.ts';

/** One plain HTTP server on an ephemeral port — the client-mechanics fixtures. */
async function listen(
  serve: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => void,
): Promise<{ server: Server; url: string }> {
  const server = createServer(serve);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
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

test('an IPv6 binding reaches the live server — the brackets leave at the parse', async () => {
  // new URL().hostname keeps the brackets; the socket's option wants
  // the bare literal (the Copilot round's find: '[::1]' is a name the
  // resolver chases — ENOTFOUND — while the bare literal connects).
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '::1', resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  try {
    const answer = await httpCall(
      { url: `http://[${address.address}]:${address.port}`, token: 'souv-x' },
      { method: 'get', path: '/healthz' },
    );
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.document, { ok: true });
  } finally {
    await closeServer(server);
  }
});

test('the wire\u2019s declared markdown rides verbatim — the skills\u2019 body, carried as a string', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await httpCall(wire.store, { method: 'get', path: '/skills/waking' });
    assert.equal(answer.status, 200);
    assert.equal(answer.document, readFileSync(join('skills', 'waking', 'SKILL.md'), 'utf8'));
  } finally {
    await wire.close();
  }
});

test('a declared markdown body carries on a stub too — the content type is the judge', async () => {
  const wire = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
    res.end('---\nname: probe\n---\n\nthe body');
  });
  try {
    const answer = await httpCall({ url: wire.url, token: 'souv-x' }, { method: 'get', path: '/' });
    assert.equal(answer.status, 200);
    assert.equal(answer.document, '---\nname: probe\n---\n\nthe body');
  } finally {
    await closeServer(wire.server);
  }
});

/**
 * The deadline's fixture: a server that answers only in part, forever —
 * `headers` never completes the header block, `body` streams a body
 * that never ends. The arrival gate keeps the clock from moving before
 * the server holds the connection (a pre-connect destroy would leave
 * the handler unrun and the close unobserved); the close signal is what
 * the settle must fire.
 */
async function partialServer(frame: 'headers' | 'body'): Promise<{
  server: Server;
  url: string;
  requestArrived: Promise<void>;
  connectionClosed: Promise<void>;
}> {
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
    socket?.write(frame === 'headers' ? 'HTTP/1.1 200 OK\r\n' : 'HTTP/1.1 200 OK\r\n\r\n');
    const heartbeat = setInterval(() => socket?.write('x'), 200);
    socket?.once('close', () => {
      clearInterval(heartbeat);
      signalClosed();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  return { server, url: `http://127.0.0.1:${address.port}`, requestArrived, connectionClosed };
}

test('a dribbling server dies at the deadline — the verdict is absolute over headers, the connection freed', async () => {
  const fixture = await partialServer('headers');
  try {
    const binding = { url: fixture.url, token: 'souv-x' };
    // The deadline is 30 s of wall clock — the judge is moved to its
    // firing, the real socket IO keeps flowing (fake timers own only
    // the clocks).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = httpCall(binding, { method: 'get', path: '/memories' });
    await fixture.requestArrived;
    const answer = await vi.advanceTimersByTimeAsync(30_000).then(() => pending);
    assert.equal(answer.status, 0);
    assert.match(
      String((answer.document as { error: string }).error),
      /did not answer within 30 s/,
    );
    // The settle tore the connection down: the server observes its
    // close promptly, on the real clock (the leaked-promise race names
    // a settle that freed nothing).
    vi.useRealTimers();
    const closed = await Promise.race([
      fixture.connectionClosed.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    assert.equal(closed, true, 'the settle must free the connection');
  } finally {
    vi.useRealTimers();
    fixture.server.closeAllConnections();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  }
});

test('a never-ending body dies at the deadline too — the absolute judge covers the body', async () => {
  const fixture = await partialServer('body');
  try {
    const binding = { url: fixture.url, token: 'souv-x' };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = httpCall(binding, { method: 'get', path: '/memories' });
    await fixture.requestArrived;
    const answer = await vi.advanceTimersByTimeAsync(30_000).then(() => pending);
    assert.equal(answer.status, 0);
    assert.match(
      String((answer.document as { error: string }).error),
      /did not answer within 30 s/,
    );
    vi.useRealTimers();
    const closed = await Promise.race([
      fixture.connectionClosed.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    assert.equal(closed, true, 'the settle must free the connection');
  } finally {
    vi.useRealTimers();
    fixture.server.closeAllConnections();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  }
});
