import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { Store } from '../../../modules.private/store/store.ts';
import { storeDbPath } from '../../../modules.private/server/registry/store-db-path/store-db-path.ts';
import { forkAction } from './fork.ts';

const ALIVE = async (): Promise<boolean> => true;
const DOWN = async (): Promise<boolean> => false;
const TTY = { tty: true };
const PIPED = { tty: false };

/** The temp home: a stores dir, the config pointing at it (the tests' own file). */
function tempHome(): {
  readonly root: string;
  readonly storesDir: string;
  readonly configPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'souvenance-fork-cli-test-'));
  const storesDir = join(root, 'stores');
  mkdirSync(storesDir, { recursive: true });
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify({ storesDir, tokens: [], management: [] }));
  return { root, storesDir, configPath };
}

/** A real source store with contents worth copying (memories, and one edge if asked). */
function seedStore(storesDir: string, name: string, memories: number, edges: number): void {
  const store = Store.open({ dbPath: storeDbPath(storesDir, name) });
  try {
    const ids: string[] = [];
    for (let index = 0; index < memories; index++) {
      ids.push(store.store(`memory ${index} of ${name}`, { kind: 'note' }));
    }
    if (edges > 0 && ids.length >= 2) {
      store.link(ids[0] as string, ids[1] as string, 'references');
    }
  } finally {
    store.close();
  }
}

function readConfig(path: string): {
  readonly tokens: readonly { agent: string; store: string }[];
} {
  return JSON.parse(readFileSync(path, 'utf8')) as {
    readonly tokens: readonly { agent: string; store: string }[];
  };
}

test('the fork lands an exact copy — the counts ride the doc, the file born 0600', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 2, 0);
    const answer = await forkAction(
      { source: 'euria', target: 'child' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('name' in answer.document, JSON.stringify(answer.document));
    assert.deepEqual(answer.document, {
      source: 'euria',
      name: 'child',
      path: storeDbPath(home.storesDir, 'child'),
      memories: 2,
      edges: 0,
    });
    assert.equal(answer.exitCode, 0);
    assert.equal(existsSync(storeDbPath(home.storesDir, 'child')), true);
    assert.equal(statSync(storeDbPath(home.storesDir, 'child')).mode & 0o777, 0o600);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('the composed name: source-fork when nothing occupies it', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    const answer = await forkAction(
      { source: 'euria' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('name' in answer.document);
    assert.equal(answer.document.name, 'euria-fork');
    assert.equal(existsSync(storeDbPath(home.storesDir, 'euria-fork')), true);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('the composition walks the ladder when -fork is taken', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    writeFileSync(storeDbPath(home.storesDir, 'euria-fork'), '');
    const answer = await forkAction(
      { source: 'euria' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('name' in answer.document);
    assert.equal(answer.document.name, 'euria-fork-2');
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('the composed child dodges a grant\u2019s name by construction — the stale row never reaches', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    writeFileSync(
      home.configPath,
      JSON.stringify({
        storesDir: home.storesDir,
        tokens: [
          { agent: 'continu', secret: `souv-${'b'.repeat(32)}`, store: 'euria-fork', mode: 'rw' },
        ],
        management: [],
      }),
    );
    const answer = await forkAction(
      { source: 'euria' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('name' in answer.document);
    // The row's store left the disk, the row itself stayed — the
    // composition's occupied set carries it, so the child is born under
    // the next name and the derelict secret reaches nothing.
    assert.equal(answer.document.name, 'euria-fork-2');
    assert.equal(answer.exitCode, 0);
    assert.equal(existsSync(storeDbPath(home.storesDir, 'euria-fork')), false);
    assert.equal(existsSync(storeDbPath(home.storesDir, 'euria-fork-2')), true);
    assert.deepEqual(readConfig(home.configPath).tokens, [
      { agent: 'continu', secret: `souv-${'b'.repeat(32)}`, store: 'euria-fork', mode: 'rw' },
    ]);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('the composition\u2019s bound conflict serves its JSON — no rejection past the await', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    // Every candidate the shared rule can draw is a store file: the
    // 100-bound conflict is the only answer left.
    for (let attempt = 1; attempt < 100; attempt++) {
      const suffix = attempt === 1 ? '-fork' : `-fork-${attempt}`;
      writeFileSync(storeDbPath(home.storesDir, `euria${suffix}`), '');
    }
    const answer = await forkAction(
      { source: 'euria' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /no free fork name for "euria"/);
    assert.equal(answer.exitCode, 1);
    // Nothing was copied in the conflict's place: the dir holds the
    // source and the rung files exactly, nothing new.
    const stores = readdirSync(home.storesDir).filter((entry) => entry.endsWith('.db'));
    assert.equal(stores.length, 100);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('an explicit target\u2019s collision refuses — the pass-force clause never crosses', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    writeFileSync(storeDbPath(home.storesDir, 'child'), '');
    const answer = await forkAction(
      { source: 'euria', target: 'child' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /fork target already exists: /);
    assert.equal(answer.document.error.includes('pass force'), false);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('an absent source refuses — the registry\u2019s voice, the dir named', async () => {
  const home = tempHome();
  try {
    const answer = await forkAction(
      { source: 'ghost' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /no store "ghost" in the registry at /);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('the target\u2019s grammar teaches — lowercase letters, digits, dashes', async () => {
  const home = tempHome();
  try {
    const answer = await forkAction(
      { source: 'euria', target: 'BAD_Name' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /breaks the grammar/);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('a traversal source dies at the grammar — no path is built, nothing is read', async () => {
  const home = tempHome();
  try {
    // The wedge's premise made real: a compatible store file the
    // traversal would resolve to, OUTSIDE the stores dir — it exists,
    // and the copy must never reach it.
    const outside = join(home.root, 'archive.db');
    const archive = Store.open({ dbPath: outside });
    archive.store('the archive memory', { kind: 'note' });
    archive.close();
    const answer = await forkAction(
      { source: '../archive', target: 'child' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /breaks the grammar/);
    assert.equal(answer.document.error.includes('no store'), false);
    assert.equal(answer.exitCode, 1);
    // The gate stands before the path: the child's file was never
    // written, the archive's memory never left home.
    assert.equal(existsSync(storeDbPath(home.storesDir, 'child')), false);
    const stores = readdirSync(home.storesDir).filter((entry) => entry.endsWith('.db'));
    assert.deepEqual(stores, []);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('a running server refuses — the wire door taught', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    const answer = await forkAction(
      { source: 'euria' },
      { configPath: home.configPath, liveness: ALIVE },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /POST \/stores\/\{name\}\/fork/);
    assert.match(answer.document.error, /management grant as the Bearer/);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('a malformed config refuses with 78 before the probe', async () => {
  const root = mkdtempSync(join(tmpdir(), 'souvenance-fork-cli-test-'));
  const configPath = join(root, 'config.json');
  const probes: string[] = [];
  const liveness = async (): Promise<boolean> => (probes.push('probe'), true);
  try {
    writeFileSync(configPath, '{ not json');
    const answer = await forkAction({ source: 'euria' }, { configPath, liveness });
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /not valid JSON/);
    assert.equal(answer.exitCode, 78);
    assert.equal(probes.length, 0, 'the 78 comes before any probe');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the birth chains — the secret exactly once, the row authored, rw by default', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    const answer = await forkAction(
      { source: 'euria', target: 'child', grant: 'continu' },
      { configPath: home.configPath, liveness: DOWN, ...TTY },
    );
    assert.ok('grant' in answer.document);
    const grant = answer.document.grant;
    assert.ok(grant !== undefined);
    assert.deepEqual(
      { agent: grant.agent, store: grant.store, mode: grant.mode },
      { agent: 'continu', store: 'child', mode: 'rw' },
    );
    assert.match(grant.secret, /^souv-/);
    assert.equal(answer.exitCode, 0);
    const tokens = readConfig(home.configPath).tokens;
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.store, 'child');
    assert.equal(existsSync(storeDbPath(home.storesDir, 'child')), true);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('the birth\u2019s mode: --mode ro rides the chain', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    const answer = await forkAction(
      { source: 'euria', grant: 'continu', mode: 'ro' },
      { configPath: home.configPath, liveness: DOWN, ...TTY },
    );
    assert.ok('grant' in answer.document);
    assert.equal(answer.document.grant?.mode, 'ro');
    assert.equal(answer.document.name, 'euria-fork');
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('a piped birth refuses before anything is written', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    const answer = await forkAction(
      { source: 'euria', grant: 'continu' },
      { configPath: home.configPath, liveness: DOWN, ...PIPED },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /never crosses a pipe/);
    assert.equal(answer.exitCode, 1);
    assert.equal(existsSync(storeDbPath(home.storesDir, 'euria-fork')), false);
    assert.deepEqual(readConfig(home.configPath).tokens, []);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('--mode without --grant pairs the refusal', async () => {
  const home = tempHome();
  try {
    const answer = await forkAction(
      { source: 'euria', mode: 'ro' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /the mode pairs with --grant/);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('the dot birth agents refuse — the mint doors\u2019 own words', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    for (const grant of ['.', '..']) {
      const answer = await forkAction(
        { source: 'euria', grant },
        { configPath: home.configPath, liveness: DOWN, ...TTY },
      );
      assert.ok('error' in answer.document);
      assert.match(answer.document.error, /revoke URL .* could never address/);
      assert.equal(answer.exitCode, 1);
      assert.equal(existsSync(storeDbPath(home.storesDir, 'euria-fork')), false);
    }
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('an explicit target already named by a grant refuses before the copy — born unreached', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    writeFileSync(
      home.configPath,
      JSON.stringify({
        storesDir: home.storesDir,
        tokens: [
          { agent: 'continu', secret: `souv-${'a'.repeat(32)}`, store: 'child', mode: 'rw' },
        ],
        management: [],
      }),
    );
    const answer = await forkAction(
      { source: 'euria', target: 'child', grant: 'continu' },
      { configPath: home.configPath, liveness: DOWN, ...TTY },
    );
    assert.ok('error' in answer.document);
    // The grants' state gate speaks before the copy: the row's store
    // file was gone, so the copy would boot reached by the derelict
    // secret — the gate refuses, the remedy is the grant family's own.
    assert.match(
      answer.document.error,
      /fork target "child" already holds a store grant \(agent "continu"\)/,
    );
    assert.match(answer.document.error, /souvenance grant store remove <agent> <store>/);
    assert.equal(answer.exitCode, 1);
    // Nothing was written: no copy beside the row, no extra row — one
    // refusal in the state the config already had.
    assert.equal(existsSync(storeDbPath(home.storesDir, 'child')), false);
    assert.deepEqual(readConfig(home.configPath).tokens, [
      { agent: 'continu', secret: `souv-${'a'.repeat(32)}`, store: 'child', mode: 'rw' },
    ]);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('a mint\u2019s failure after the copy serves the copy\u2019s facts beside the refusal', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    // The config's DIRECTORY goes read-only: the mint itself would
    // succeed, the authoring cannot — a copy stands, a grant does not.
    chmodSync(home.root, 0o500);
    const answer = await forkAction(
      { source: 'euria', target: 'child', grant: 'continu' },
      { configPath: home.configPath, liveness: DOWN, ...TTY },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /the credential write at .* failed/);
    assert.ok('copy' in answer.document);
    assert.deepEqual(answer.document.copy, {
      source: 'euria',
      name: 'child',
      path: storeDbPath(home.storesDir, 'child'),
      memories: 1,
      edges: 0,
    });
    assert.equal(answer.exitCode, 1);
    // The copy's truth rides the refusal: the file is on disk, the row
    // is not — the operator sees both from the one document.
    assert.equal(existsSync(storeDbPath(home.storesDir, 'child')), true);
    assert.deepEqual(readConfig(home.configPath).tokens, []);
  } finally {
    chmodSync(home.root, 0o700);
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('a native open failure is served as JSON — no rejection past the await', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    // The store's own open refuses a corrupt file with a typed error
    // (the schema's teaching); a file the OS refuses to even read
    // fails BELOW the types — the net still owes its JSON.
    chmodSync(storeDbPath(home.storesDir, 'euria'), 0o000);
    const answer = await forkAction(
      { source: 'euria' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /unable to open database/);
    assert.equal(answer.document.error.includes('schema version'), false);
    assert.equal(answer.exitCode, 1);
    assert.equal(existsSync(storeDbPath(home.storesDir, 'euria-fork')), false);
  } finally {
    chmodSync(storeDbPath(home.storesDir, 'euria'), 0o600);
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('a native copy failure is served as JSON — the open\u2019s net at the copy\u2019s seam', async () => {
  const home = tempHome();
  try {
    seedStore(home.storesDir, 'euria', 1, 0);
    // The copy's own failure, made real: the target is a symlink that
    // dangles — existsSync is false (the typed conflict never speaks)
    // and the create through the link fails at the OS, a filesystem
    // error the store does not type. The net still owes its JSON.
    symlinkSync(join(home.root, 'nowhere-at-all', 'dest'), storeDbPath(home.storesDir, 'child'));
    const answer = await forkAction(
      { source: 'euria', target: 'child' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /unable to open database/);
    assert.equal(answer.document.error.includes('fork target already exists'), false);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});

test('an out-of-date store teaches the boot\u2019s remedy — never "open it read-write"', async () => {
  const home = tempHome();
  try {
    // A zero-length db speaks schema version 0 — the readonly open refuses.
    writeFileSync(storeDbPath(home.storesDir, 'euria'), '');
    const answer = await forkAction(
      { source: 'euria' },
      { configPath: home.configPath, liveness: DOWN },
    );
    assert.ok('error' in answer.document);
    assert.match(answer.document.error, /is at schema version 0 \(the library expects \d+\)/);
    assert.match(answer.document.error, /boot the server once to migrate, then fork/);
    assert.equal(answer.document.error.includes('open it read-write'), false);
    assert.equal(answer.exitCode, 1);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
});
