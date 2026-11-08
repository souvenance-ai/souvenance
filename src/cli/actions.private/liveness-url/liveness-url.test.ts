import assert from 'node:assert/strict';
import { test } from 'vitest';
import { livenessUrl } from './liveness-url.ts';

test('a loopback literal builds the plain healthz URL on the config port', () => {
  assert.equal(livenessUrl({ host: '127.0.0.1', port: 3141 }), 'http://127.0.0.1:3141/healthz');
});

test('an IPv6 host is bracketed — a bare ::1 would parse as a port separator', () => {
  assert.equal(livenessUrl({ host: '::1', port: 3141 }), 'http://[::1]:3141/healthz');
});
