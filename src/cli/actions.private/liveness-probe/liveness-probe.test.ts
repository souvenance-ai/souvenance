import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'vitest';
import { probeLiveness } from './liveness-probe.ts';

test('a served port answers alive — any answer counts, ours included', async () => {
  const server: Server = createServer((_request, response) => {
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    assert.ok(address !== null && typeof address === 'object');
    const alive = await probeLiveness({ host: address.address, port: address.port });
    assert.equal(alive, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a refused connection is dead — the manager owns the config', async () => {
  const dead = await probeLiveness({ host: '127.0.0.1', port: 1 });
  assert.equal(dead, false);
});

test('a live listener on port 6000 answers alive — the fetch port-block lie dies here', async () => {
  // Port 6000 sits on the fetch spec's blocked list (X11): the fetch idiom
  // refused before connecting and reported this server DOWN. The node:http
  // probe connects and asks the socket the only question that matters:
  // is the port served?
  const server: Server = createServer((_request, response) => {
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(6000, '127.0.0.1', resolve);
  });
  try {
    const alive = await probeLiveness({ host: '127.0.0.1', port: 6000 });
    assert.equal(alive, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a dribbling server dies on the deadline — socket idleness alone would hang forever', async () => {
  // Partial headers, forever: the status line lands once (hand-rolled —
  // the first `response.write` would send the header block whole), then
  // one legal tchar per heartbeat extends a header name that never sees
  // its CR LF terminator. The client parser stays content and
  // incomplete; the socket never idles — node:http's socket timeout
  // counts silent stretches alone — so the old idleness-only judge held
  // the probe past the promised second, forever. The request-wide
  // deadline is the door that closes here; the verdict falls, the
  // probe's destroy tears the connection down, and the interval dies
  // with the socket. Wall-clock is not pinned tighter than the deadline
  // itself — the one-second promise owns the verdict, not the clock.
  const server: Server = createServer((_request, response) => {
    const socket = response.socket;
    socket?.write('HTTP/1.1 200 OK\r\n');
    const dribble = setInterval(() => {
      socket?.write('x');
    }, 200);
    socket?.once('close', () => clearInterval(dribble));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    assert.ok(address !== null && typeof address === 'object');
    const dead = await probeLiveness({ host: address.address, port: address.port });
    assert.equal(dead, false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a never-ending body does not linger — the settle frees the connection', async () => {
  // Headers complete, body forever: the status line and header block
  // conclude once, then one byte per heartbeat streams a body that
  // never ends (no Content-Length, so the message closes only with its
  // connection). The verdict is ALIVE at the headers — the pin is what
  // follows: this server observes its connection closing promptly after
  // the settle. A settle that freed nothing would hold the CLI process
  // open past the answer it had already printed; the race names that
  // betrayal instead of waiting on it.
  let signalClosed: () => void = () => {};
  const connectionClosed = new Promise<void>((resolve) => {
    signalClosed = resolve;
  });
  const server: Server = createServer((_request, response) => {
    const socket = response.socket;
    socket?.write('HTTP/1.1 200 OK\r\n\r\n');
    const stream = setInterval(() => {
      socket?.write('x');
    }, 200);
    socket?.once('close', () => {
      clearInterval(stream);
      signalClosed();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.ok(address !== null && typeof address === 'object');
    const alive = await probeLiveness({ host: address.address, port: address.port });
    assert.equal(alive, true);
    const closed = await Promise.race([
      connectionClosed,
      new Promise<string>((resolve) => setTimeout(() => resolve('leaked'), 2_000)),
    ]);
    assert.equal(closed, undefined, 'the connection never closed — the settle leaked it');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a host the request could never carry is dead — the constructor judged too', async () => {
  // The config's grammar admits every non-empty host string; HTTP
  // cannot carry some — the host rides the Host header, and a control
  // character or a non-ASCII literal throws synchronously at the
  // request's construction, before any socket, listener, or deadline
  // exists. A throw escaping there would reject the awaited probe and
  // kill the CLI's one-JSON-refusal contract; the constructor's throw
  // is judged like every failure class: not alive, no rejection.
  const control = await probeLiveness({ host: 'a\nb', port: 3141 });
  const nonAscii = await probeLiveness({ host: '😀', port: 3141 });
  assert.equal(control, false);
  assert.equal(nonAscii, false);
});
