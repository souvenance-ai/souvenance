/**
 * The binding resolver's pins (#22): the env contract is the bridge's
 * public surface — every user writes these names into an MCP client's
 * config, so every pin here is a contract pin, not an implementation
 * detail.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { ConfigError, DEFAULT_HOST, DEFAULT_PORT } from '../../config/config.ts';
import { resolveBinding } from './binding.ts';

describe('resolveBinding', () => {
  it('resolves both facts from the environment, verbatim', () => {
    const binding = resolveBinding({
      SOUVENANCE_URL: 'http://127.0.0.1:4242',
      SOUVENANCE_TOKEN: 'souv-' + 'a'.repeat(32),
    });
    assert.equal(binding.url, 'http://127.0.0.1:4242');
    assert.equal(binding.token, 'souv-' + 'a'.repeat(32));
  });

  it('absent URL falls back to the server boot defaults — one default, both sides', () => {
    const binding = resolveBinding({ SOUVENANCE_TOKEN: 'souv-' + 'a'.repeat(32) });
    assert.equal(binding.url, `http://${DEFAULT_HOST}:${DEFAULT_PORT}`);
    assert.equal(binding.url, 'http://127.0.0.1:3141');
  });

  it('an empty or whitespace URL counts as absent, an empty token refuses', () => {
    const emptyUrl = resolveBinding({
      SOUVENANCE_URL: '',
      SOUVENANCE_TOKEN: 'souv-' + 'a'.repeat(32),
    });
    assert.equal(emptyUrl.url, 'http://127.0.0.1:3141');
    assert.throws(
      () => resolveBinding({ SOUVENANCE_URL: 'http://127.0.0.1:3141', SOUVENANCE_TOKEN: '   ' }),
      ConfigError,
    );
  });

  it('the URL normalizes: whitespace trimmed, trailing slashes stripped', () => {
    const binding = resolveBinding({
      SOUVENANCE_URL: '  http://127.0.0.1:4242///  ',
      SOUVENANCE_TOKEN: 'souv-' + 'a'.repeat(32),
    });
    assert.equal(binding.url, 'http://127.0.0.1:4242');
  });

  it('a malformed URL refuses with the teaching — a slipped hand, not a guess', () => {
    assert.throws(
      () =>
        resolveBinding({ SOUVENANCE_URL: 'not a url', SOUVENANCE_TOKEN: 'souv-' + 'a'.repeat(32) }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /SOUVENANCE_URL "not a url" is not a URL/);
        return true;
      },
    );
  });

  it('a non-http scheme refuses — the bridge speaks the wire, nothing else', () => {
    assert.throws(
      () =>
        resolveBinding({
          SOUVENANCE_URL: 'ftp://127.0.0.1:3141',
          SOUVENANCE_TOKEN: 'souv-' + 'a'.repeat(32),
        }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /must speak http or https/);
        return true;
      },
    );
  });

  it('an absent token refuses with the teaching — the freestyle operator stays retired (#63)', () => {
    assert.throws(
      () => resolveBinding({}),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /SOUVENANCE_TOKEN is absent/);
        assert.match(error.message, /one Bearer = one store/);
        assert.match(error.message, /SOUVENANCE_URL/);
        return true;
      },
    );
  });
});
