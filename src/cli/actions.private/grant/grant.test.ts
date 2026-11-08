import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { grantAction } from './grant.ts';

const SECRET = `souv-${'a'.repeat(32)}`;
const ALIVE = async (): Promise<boolean> => true;
const DOWN = async (): Promise<boolean> => false;
const TTY = { tty: true };
const PIPED = { tty: false };

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-grant-cli-test-'));
}

/** A config file seeded loose (0644) — the guarded-rig's worst cheat, tightened on a mint. */
function looseConfigPath(directory: string, content: string): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'config.json');
  writeFileSync(path, content, { mode: 0o644 });
  return path;
}

function readFamilies(path: string): FamiliesFile {
  return JSON.parse(readFileSync(path, 'utf8')) as FamiliesFile;
}

/** The file's shape as the tests read it back — the keys it may carry. */
interface FamiliesFile {
  readonly tokens?: unknown[];
  readonly management?: unknown[];
  readonly port?: unknown;
}

test('store add on a cold host mints the first grant — the file born 0600', async () => {
  const directory = tempHome();
  const path = join(directory, 'sub', 'config.json');
  try {
    const answer = await grantAction(
      'store add',
      { agent: 'mneme-laptop', store: 'main', mode: 'rw' },
      {
        configPath: path,
        liveness: DOWN,
        ...TTY,
      },
    );
    assert.ok('mode' in answer.document, JSON.stringify(answer.document));
    assert.ok(answer.document.secret.startsWith('souv-'));
    assert.equal(answer.document.agent, 'mneme-laptop');
    assert.equal(answer.document.store, 'main');
    assert.equal(answer.document.mode, 'rw');
    assert.equal(answer.exitCode, 0);
    const families = readFamilies(path);
    const tokens = families.tokens as {
      agent: string;
      secret: string;
      store: string;
      mode: string;
    }[];
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.secret, answer.document.secret);
    assert.deepEqual(families.management, []);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('store add tightens an existing loose file — the 0644 cheat dies on the first write', async () => {
  const directory = tempHome();
  const path = looseConfigPath(directory, JSON.stringify({ port: 6553, tokens: [] }));
  try {
    const answer = await grantAction(
      'store add',
      { agent: 'atlas', store: 'main', mode: 'ro' },
      {
        configPath: path,
        liveness: DOWN,
        ...TTY,
      },
    );
    assert.ok('secret' in answer.document);
    assert.equal(answer.exitCode, 0);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(readFamilies(path).port, 6553);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a piped add refuses before the mint — no row, no file', async () => {
  const directory = tempHome();
  const path = join(directory, 'config.json');
  try {
    const answer = await grantAction(
      'store add',
      { agent: 'atlas', store: 'main', mode: 'ro' },
      {
        configPath: path,
        liveness: DOWN,
        ...PIPED,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /never crosses a pipe/);
    assert.equal(answer.exitCode, 1);
    assert.equal(statSync(path, { throwIfNoEntry: false }), undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a running server refuses the store mint — the wire door taught, the file untouched', async () => {
  const directory = tempHome();
  const path = looseConfigPath(directory, JSON.stringify({ port: 6553 }));
  const before = readFileSync(path, 'utf8');
  const probed: string[] = [];
  const liveness = async (): Promise<boolean> => (probed.push('mint'), true);
  try {
    const answer = await grantAction(
      'store add',
      { agent: 'atlas', store: 'main', mode: 'ro' },
      {
        configPath: path,
        liveness,
        ...TTY,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /live credential state is the running server's/);
    assert.match(answer.document.error, /POST\/GET\/DELETE \/stores\/\{name\}\/grants/);
    assert.match(answer.document.error, /management grant as the Bearer/);
    assert.match(answer.document.error, /127\.0\.0\.1:6553/);
    assert.equal(answer.exitCode, 1);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.equal(probed.length, 1, 'the write probes exactly once');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a running server refuses the management mint with its own voice — no wire door, hand-edit taught', async () => {
  const directory = tempHome();
  const path = looseConfigPath(directory, JSON.stringify({ port: 6553 }));
  const before = readFileSync(path, 'utf8');
  try {
    const answer = await grantAction(
      'management add',
      { agent: 'ops' },
      {
        configPath: path,
        liveness: ALIVE,
        ...TTY,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /management family has no wire door/);
    assert.match(answer.document.error, /Hand-edit the file and restart to apply/);
    assert.equal(answer.document.error.includes('/stores/{name}/grants'), false);
    assert.equal(answer.exitCode, 1);
    assert.equal(readFileSync(path, 'utf8'), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a second grant on the same pair refuses — the rotation remedy rides', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({ tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }] }),
  );
  const before = readFileSync(path, 'utf8');
  try {
    const answer = await grantAction(
      'store add',
      { agent: 'atlas', store: 'main', mode: 'ro' },
      {
        configPath: path,
        liveness: DOWN,
        ...TTY,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /already holds a grant/);
    assert.equal(answer.exitCode, 1);
    assert.equal(readFileSync(path, 'utf8'), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the same agent on another store mints — one row per (agent, store) pair', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({ tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }] }),
  );
  try {
    const answer = await grantAction(
      'store add',
      { agent: 'atlas', store: 'forked', mode: 'ro' },
      {
        configPath: path,
        liveness: DOWN,
        ...TTY,
      },
    );
    assert.ok('secret' in answer.document);
    assert.equal(answer.exitCode, 0);
    assert.equal((readFamilies(path).tokens as unknown[]).length, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the dot-segment agents refuse at the offline mint door — the wire’s own words', async () => {
  const directory = tempHome();
  const path = join(directory, 'config.json');
  try {
    for (const agent of ['.', '..']) {
      const answer = await grantAction(
        'store add',
        { agent, store: 'main', mode: 'ro' },
        {
          configPath: path,
          liveness: DOWN,
          ...TTY,
        },
      );
      assert.ok('error' in answer.document);
      assert.match(answer.document.error, /revoke URL .* could never address/);
      assert.equal(answer.exitCode, 1);
      assert.equal(statSync(path, { throwIfNoEntry: false }), undefined);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a wrong mode refuses — the mode’s own teaching', async () => {
  const directory = tempHome();
  const path = join(directory, 'config.json');
  try {
    const answer = await grantAction(
      'store add',
      { agent: 'atlas', store: 'main', mode: 'admin' },
      {
        configPath: path,
        liveness: DOWN,
        ...TTY,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /the mode is ro or rw/);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a malformed file refuses with exit 78 at every door — the probe never consulted', async () => {
  const directory = tempHome();
  const path = looseConfigPath(directory, '{ not json');
  const probed: string[] = [];
  const liveness = async (): Promise<boolean> => (probed.push('probe'), true);
  try {
    for (const command of ['store add', 'store list', 'store remove', 'management add'] as const) {
      const args = command.includes('list') ? {} : { agent: 'atlas', store: 'main', mode: 'ro' };
      const answer = await grantAction(command, args, {
        configPath: path,
        liveness,
        ...TTY,
      });
      assert.ok('error' in answer.document, `${command}: ${JSON.stringify(answer.document)}`);
      assert.match(answer.document.error, /not valid JSON/);
      assert.equal(answer.exitCode, 78);
    }
    assert.equal(probed.length, 0, 'the 78 comes before any probe — the config verdict first');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('store list serves the rows, never the secrets — and no management row', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({
      tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
      management: [{ agent: 'ops', secret: `souv-${'b'.repeat(32)}` }],
    }),
  );
  try {
    const answer = await grantAction(
      'store list',
      {},
      { configPath: path, ...PIPED, liveness: ALIVE },
    );
    assert.ok('grants' in answer.document);
    assert.deepEqual(answer.document.grants, [{ agent: 'atlas', store: 'main', mode: 'rw' }]);
    assert.equal(answer.exitCode, 0);
    assert.equal(JSON.stringify(answer.document).includes(SECRET), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('store reveal serves the row with its secret — on a TTY alone', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({
      tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
    }),
  );
  try {
    const answer = await grantAction(
      'store reveal',
      { agent: 'atlas', store: 'main' },
      {
        configPath: path,
        ...TTY,
      },
    );
    assert.ok('secret' in answer.document);
    assert.deepEqual(answer.document, {
      agent: 'atlas',
      store: 'main',
      mode: 'rw',
      secret: SECRET,
    });
    const piped = await grantAction(
      'store reveal',
      { agent: 'atlas', store: 'main' },
      {
        configPath: path,
        ...PIPED,
      },
    );
    assert.ok('error' in piped.document);
    assert.match(piped.document.error, /never crosses a pipe/);
    assert.equal(piped.exitCode, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('store reveal with no pair refuses', async () => {
  const directory = tempHome();
  const path = join(directory, 'config.json');
  try {
    const answer = await grantAction(
      'store reveal',
      { agent: 'ghost', store: 'main' },
      {
        configPath: path,
        ...TTY,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /no grant for "ghost" on "main"/);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('store remove takes the pair off the file — the other family and siblings ride verbatim', async () => {
  const directory = tempHome();
  const managementSecret = `souv-${'b'.repeat(32)}`;
  const path = looseConfigPath(
    directory,
    JSON.stringify({
      port: 6552,
      tokens: [
        { agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' },
        { agent: 'scribe', secret: `souv-${'c'.repeat(32)}`, store: 'main', mode: 'ro' },
      ],
      management: [{ agent: 'ops', secret: managementSecret }],
    }),
  );
  try {
    const answer = await grantAction(
      'store remove',
      { agent: 'atlas', store: 'main' },
      {
        configPath: path,
        liveness: DOWN,
      },
    );
    assert.ok('revoked' in answer.document);
    assert.deepEqual(answer.document, { agent: 'atlas', store: 'main', revoked: true });
    assert.equal(answer.exitCode, 0);
    const families = readFamilies(path);
    const tokens = families.tokens as { agent: string }[];
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.agent, 'scribe');
    assert.deepEqual(families.management, [{ agent: 'ops', secret: managementSecret }]);
    assert.deepEqual(families.port, 6552);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('store remove with no pair refuses', async () => {
  const directory = tempHome();
  const path = join(directory, 'config.json');
  try {
    const answer = await grantAction(
      'store remove',
      { agent: 'ghost', store: 'main' },
      {
        configPath: path,
        liveness: DOWN,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /no grant for "ghost" on "main"/);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('management add mints the host row — tokens ride verbatim', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({ tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }] }),
  );
  try {
    const answer = await grantAction(
      'management add',
      { agent: 'ops' },
      {
        configPath: path,
        liveness: DOWN,
        ...TTY,
      },
    );
    assert.ok('secret' in answer.document);
    assert.deepEqual(answer.document, { agent: 'ops', secret: answer.document.secret });
    assert.equal(answer.exitCode, 0);
    const families = readFamilies(path);
    assert.equal((families.tokens as unknown[]).length, 1);
    assert.equal((families.management as { agent: string }[])[0]?.agent, 'ops');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a second management row on the same agent refuses — one row per agent, the remedy taught', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({ management: [{ agent: 'ops', secret: SECRET }] }),
  );
  const before = readFileSync(path, 'utf8');
  try {
    const answer = await grantAction(
      'management add',
      { agent: 'ops' },
      {
        configPath: path,
        liveness: DOWN,
        ...TTY,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /already holds a management grant/);
    assert.equal(answer.exitCode, 1);
    assert.equal(readFileSync(path, 'utf8'), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('management list serves the agents alone', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({ management: [{ agent: 'ops', secret: SECRET }] }),
  );
  try {
    const answer = await grantAction('management list', {}, { configPath: path, ...PIPED });
    assert.ok('grants' in answer.document);
    assert.deepEqual(answer.document.grants, [{ agent: 'ops' }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('management reveal serves the secret — the first match, the boot’s own resolution', async () => {
  const directory = tempHome();
  const other = `souv-${'b'.repeat(32)}`;
  const path = looseConfigPath(
    directory,
    JSON.stringify({
      management: [
        { agent: 'ops', secret: SECRET },
        { agent: 'ops', secret: other },
      ],
    }),
  );
  try {
    const answer = await grantAction(
      'management reveal',
      { agent: 'ops' },
      { configPath: path, ...TTY },
    );
    assert.ok('secret' in answer.document);
    assert.equal(answer.document.secret, SECRET);
    assert.equal(answer.exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('management remove takes the row off the file — store family rides verbatim', async () => {
  const directory = tempHome();
  const path = looseConfigPath(
    directory,
    JSON.stringify({
      tokens: [{ agent: 'atlas', secret: SECRET, store: 'main', mode: 'rw' }],
      management: [{ agent: 'ops', secret: `souv-${'b'.repeat(32)}` }],
    }),
  );
  try {
    const answer = await grantAction(
      'management remove',
      { agent: 'ops' },
      {
        configPath: path,
        liveness: DOWN,
      },
    );
    assert.ok('revoked' in answer.document);
    assert.deepEqual(answer.document, { agent: 'ops', revoked: true });
    const families = readFamilies(path);
    assert.deepEqual(families.management, []);
    assert.equal((families.tokens as unknown[]).length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('management remove with no row refuses', async () => {
  const directory = tempHome();
  const path = join(directory, 'config.json');
  try {
    const answer = await grantAction(
      'management remove',
      { agent: 'ghost' },
      {
        configPath: path,
        liveness: DOWN,
      },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /no management row for "ghost"/);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the reads probe nothing — the echo is read free, TTY or not', async () => {
  const directory = tempHome();
  const path = looseConfigPath(directory, JSON.stringify({ tokens: [] }));
  const probed: string[] = [];
  const liveness = async (): Promise<boolean> => (probed.push('read'), true);
  try {
    const answer = await grantAction('store list', {}, { configPath: path, liveness });
    assert.ok('grants' in answer.document);
    assert.deepEqual(answer.document.grants, []);
    assert.equal(answer.exitCode, 0);
    assert.equal(probed.length, 0, 'the reads never probe');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
