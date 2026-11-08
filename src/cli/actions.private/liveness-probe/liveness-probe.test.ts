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
