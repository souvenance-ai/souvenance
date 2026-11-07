//
// Phase E — the grant routes on the management surface (#98): the wire
// mints, lists and revokes store grants. Credentials: gamma = the
// management token. The phase drives the full remote ceremony (fork →
// mint ro → consume), the once-ness of the secret, the duplicate-pair
// 409, the immediate revocation, the drift refusal against hand edits
// made while running (external hand edits stay restart-to-apply), the
// 0600 the mint authors the config with, the config-file rows riding a
// fresh boot (no restart-to-apply window), and the delete-with-revoke
// (a store's rows leave with it, on both sources of truth).
//
import {
  Battery,
  Server,
  bearerHeaders,
  type ManagementGrant,
  type ProbeCase,
  ok,
  fail,
  req,
} from '../battery/battery.ts';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const GAMMA = 'souv-' + 'c'.repeat(32);
const GHOST = 'souv-' + 'd'.repeat(32);

const configPath = (b: Battery): string => join(b.homePath, '.souvenance', 'config.json');

const fileRows = async (b: Battery): Promise<unknown[]> => {
  const doc = JSON.parse(await readFile(configPath(b), 'utf8')) as Record<string, unknown>;
  return Array.isArray(doc.tokens) ? doc.tokens : [];
};

const cases: readonly ProbeCase[] = [
  {
    id: 'E01',
    name: 'the grant routes: bare 401, store grant 403 — the store family reaches nothing',
    run: async (b) => {
      for (const [method, path, body] of [
        ['GET', '/stores/euria/grants', undefined],
        ['POST', '/stores/euria/grants', { agent: 'probe', mode: 'rw' }],
        ['DELETE', '/stores/euria/grants/probe', undefined],
      ] as const) {
        const bare = await req(b.server!.url, method, path, body ? { body } : {});
        if (bare.status !== 401)
          return fail(
            `bare ${method} ${path} → ${bare.status} ${bare.text.slice(0, 120)}`,
            'doc-gap',
          );
        if (typeof (bare.json as { error?: string })?.error !== 'string')
          return fail(`bare 401 without {error} envelope: ${bare.text.slice(0, 140)}`, 'doc-gap');
      }
      // Mint a real store grant first — the knock token it becomes.
      const minted = await req(b.server!.url, 'POST', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'knocker', mode: 'ro' },
      });
      if (minted.status !== 201)
        return fail(`seed mint → ${minted.status} ${minted.text.slice(0, 140)}`);
      const knocker = String((minted.json as { secret?: string })?.secret);
      for (const [method, path, body] of [
        ['GET', '/stores/euria/grants', undefined],
        ['POST', '/stores/euria/grants', { agent: 'probe', mode: 'rw' }],
        ['DELETE', '/stores/euria/grants/knocker', undefined],
      ] as const) {
        const refused = await req(b.server!.url, method, path, {
          headers: bearerHeaders(knocker),
          body,
        });
        if (refused.status !== 403)
          return fail(`store grant ${method} ${path} → ${refused.status}`, 'doc-gap');
      }
      return ok('the trio gates: bare 401, store family 403 — every route');
    },
  },
  {
    id: 'E02',
    name: 'the mint authors the config at 0600; the list serves rows, never secrets',
    run: async (b) => {
      const minted = await req(b.server!.url, 'POST', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'archiviste', mode: 'ro' },
      });
      if (minted.status !== 201)
        return fail(`mint → ${minted.status} ${minted.text.slice(0, 140)}`);
      const row = minted.json as { agent?: string; store?: string; mode?: string; secret?: string };
      if (row.agent !== 'archiviste' || row.store !== 'euria' || row.mode !== 'ro')
        return fail(`the mint row shape: ${minted.text.slice(0, 200)}`, 'doc-gap');
      if (!/^souv-[0-9a-f]{32}$/.test(String(row.secret)))
        return fail(`the secret breaks the grammar: ${String(row.secret)}`, 'doc-gap');
      // The file echoes the row — and the write tightened it to 0600.
      const perms = (await stat(configPath(b))).mode & 0o777;
      if (perms !== 0o600)
        return fail(`the config after mint is ${(perms as number).toString(8)}, not 600`, 'bug');
      if ((await fileRows(b)).length === 0)
        return fail('the config file holds none of the rows the mint authored', 'bug');
      // The list serves the rows; the secret is once-only.
      const listed = await req(b.server!.url, 'GET', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
      });
      if (listed.status !== 200)
        return fail(`list → ${listed.status} ${listed.text.slice(0, 140)}`, 'doc-gap');
      const text = JSON.stringify(listed.json ?? '');
      if (text.includes(String(row.secret)))
        return fail('the list serves the secret — the once-ness is broken', 'bug');
      const rows = listed.json as { agent?: string; secret?: string }[];
      if (rows.length !== 2)
        return fail(`the list carries ${rows.length} rows (knocker + archiviste)`);
      for (const served of rows) {
        if ('secret' in served) return fail('a listed row carries a secret key', 'bug');
      }
      return ok('mint row + secret exactly once; the file at 0600; the list never speaks secrets');
    },
  },
  {
    id: 'E03',
    name: 'a duplicate (agent, store) mint refuses 409 with the rotation remedy, the file untouched',
    run: async (b) => {
      const before = await readFile(configPath(b), 'utf8');
      const second = await req(b.server!.url, 'POST', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'archiviste', mode: 'rw' },
      });
      if (second.status !== 409)
        return fail(`duplicate mint → ${second.status} ${second.text.slice(0, 140)}`, 'doc-gap');
      if (!/revok/.test(String((second.json as { error?: string })?.error)))
        return fail(`the 409 does not teach the rotation: ${second.text.slice(0, 200)}`);
      if ((await readFile(configPath(b), 'utf8')) !== before)
        return fail('a refused mint rewrote the config file', 'bug');
      return ok('one row per (agent, store); the remedy teaches revoke-then-mint');
    },
  },
  {
    id: 'E04',
    name: 'the dream ceremony: fork → mint ro → consume → revoke immediate → rotate',
    run: async (b) => {
      const fork = await req(b.server!.url, 'POST', '/stores/euria/fork', {
        headers: bearerHeaders(GAMMA),
        body: {},
      });
      if (fork.status !== 201) return fail(`fork → ${fork.status} ${fork.text.slice(0, 140)}`);
      const forked = String((fork.json as { name?: string })?.name);
      const mint = await req(b.server!.url, 'POST', `/stores/${forked}/grants`, {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'continuation', mode: 'ro' },
      });
      if (mint.status !== 201)
        return fail(`mint on the fork → ${mint.status} ${mint.text.slice(0, 140)}`, 'bug');
      const { secret } = mint.json as { secret?: string };
      const spoke = await req(b.server!.url, 'GET', '/memories', {
        headers: bearerHeaders(String(secret)),
      });
      if (spoke.status !== 200)
        return fail(`the fresh grant could not consume: ${spoke.status}`, 'bug');
      const revoke = await req(b.server!.url, 'DELETE', `/stores/${forked}/grants/continuation`, {
        headers: bearerHeaders(GAMMA),
      });
      if (revoke.status !== 204) return fail(`revoke → ${revoke.status}`, 'bug');
      const denied = await req(b.server!.url, 'GET', '/memories', {
        headers: bearerHeaders(String(secret)),
      });
      if (denied.status !== 401) return fail(`after revoke → ${denied.status} (wanted 401)`, 'bug');
      const again = await req(b.server!.url, 'DELETE', `/stores/${forked}/grants/continuation`, {
        headers: bearerHeaders(GAMMA),
      });
      if (again.status !== 404) return fail(`re-revoke → ${again.status} (wanted 404)`);
      // Rotation: the freed pair mints again; the mode rides the new row.
      const rotate = await req(b.server!.url, 'POST', `/stores/${forked}/grants`, {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'continuation', mode: 'rw' },
      });
      if (rotate.status !== 201) return fail(`rotation mint → ${rotate.status}`, 'bug');
      if ((rotate.json as { mode?: string }).mode !== 'rw')
        return fail('the rotation lost the mode', 'doc-gap');
      return ok(`fork ${forked} → mint → consume → revoke immediate; rotation re-opens the pair`);
    },
  },
  {
    id: 'E05',
    name: 'hand-edited rows while running refuse the wire as drift; revert re-opens it',
    run: async (b) => {
      const before = await readFile(configPath(b), 'utf8');
      // The hand speaks the wrong door: the credential rows change under the run.
      const handDoc = JSON.parse(before) as Record<string, unknown>;
      handDoc.tokens = [
        ...((handDoc.tokens as unknown[]) ?? []),
        { agent: 'ghost', secret: GHOST, store: 'euria', mode: 'rw' },
      ];
      await writeFile(configPath(b), JSON.stringify(handDoc, null, 2) + '\n');
      const mint = await req(b.server!.url, 'POST', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'scribe', mode: 'ro' },
      });
      if (mint.status !== 409)
        return fail(`a mint under drift → ${mint.status} (wanted 409)`, 'doc-gap');
      if (!/restart to apply/.test(String((mint.json as { error?: string })?.error ?? '')))
        return fail(`the drift refusal does not teach the remedy: ${mint.text.slice(0, 200)}`);
      // Byte-for-byte: the refusal touched nothing — the hand's file stands.
      if ((await readFile(configPath(b), 'utf8')) !== JSON.stringify(handDoc, null, 2) + '\n')
        return fail('the refused mint moved the hand\u2019s file', 'bug');
      // The live state was never touched: the routes still serve.
      const alive = await req(b.server!.url, 'GET', '/stores', { headers: bearerHeaders(GAMMA) });
      if (alive.status !== 200)
        return fail(`the drift refusal blocked the management surface: ${alive.status}`);
      // The revert remedy.
      await writeFile(configPath(b), before);
      const revive = await req(b.server!.url, 'POST', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'scribe', mode: 'ro' },
      });
      if (revive.status !== 201) return fail(`after revert → ${revive.status} (wanted 201)`, 'bug');
      return ok('drift 409 with the remedy taught; the revert re-opens the wire');
    },
  },
  {
    id: 'E06',
    name: 'the minted rows ride the restart — the file is the truth the next boot serves',
    run: async (b) => {
      const mint = await req(b.server!.url, 'POST', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'traveller', mode: 'ro' },
      });
      if (mint.status !== 201) return fail(`traveller mint → ${mint.status}`, 'bug');
      const { secret } = mint.json as { secret?: string };
      const stopAt = await req(b.server!.url, 'GET', '/healthz', {}, 2000);
      if (stopAt.status !== 200) return fail('the server left before the swap');
      await b.server!.stop();
      const next = new Server({
        home: b.homePath,
        port: b.port,
        logPath: join(b.root, 'logs', 'serve.log'),
      });
      await next.boot({}, 9000);
      b.adopt(next);
      const rode = await req(b.server!.url, 'GET', '/memories', {
        headers: bearerHeaders(String(secret)),
      });
      if (rode.status !== 200)
        return fail(`the minted grant died with the boot that minted it: ${rode.status}`, 'bug');
      const listed = await req(b.server!.url, 'GET', '/stores/euria/grants', {
        headers: bearerHeaders(GAMMA),
      });
      const names = (listed.json as { agent?: string }[]).map((row) => row.agent);
      for (const expected of ['knocker', 'archiviste', 'traveller']) {
        if (!names.includes(expected))
          return fail(`the fresh boot lost "${expected}"'s row`, 'bug');
      }
      if (names.includes('continuation')) {
        return fail("the fork's revoked row resurrected on restart", 'bug');
      }
      return ok('the minted rows survive the restart; the revoked stay dead');
    },
  },
  {
    id: 'E07',
    name: 'delete sweeps the store\u2019s rows off the file and the live state with it',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores', {
        headers: bearerHeaders(GAMMA),
        body: { name: 'companion' },
      });
      if (made.status !== 201) return fail(`companion create → ${made.status}`);
      const mint = await req(b.server!.url, 'POST', '/stores/companion/grants', {
        headers: bearerHeaders(GAMMA),
        body: { agent: 'caster', mode: 'rw' },
      });
      if (mint.status !== 201) return fail(`caster mint → ${mint.status}`, 'bug');
      const { secret } = mint.json as { secret?: string };
      const gone = await req(b.server!.url, 'DELETE', '/stores/companion', {
        headers: bearerHeaders(GAMMA),
      });
      if (gone.status !== 204) return fail(`delete → ${gone.status}`, 'bug');
      const denied = await req(b.server!.url, 'GET', '/memories', {
        headers: bearerHeaders(String(secret)),
      });
      if (denied.status !== 401)
        return fail(`a deleted store\u2019s grant still speaks: ${denied.status}`, 'bug');
      const left = (await fileRows(b)) as { store?: string }[];
      const strays = left.filter((row) => row.store !== 'euria' && row.store !== 'euria-fork');
      if (strays.length > 0)
        return fail(
          `rows still author stores that are gone (the next boot refuses): ${JSON.stringify(strays)}`,
          'bug',
        );
      const list = await req(b.server!.url, 'GET', '/stores/companion/grants', {
        headers: bearerHeaders(GAMMA),
      });
      if (list.status !== 404) return fail(`the deleted store's grants list → ${list.status}`);
      return ok(
        `the deleted store's rows left both sources (${left.length} rows remain, all on open stores)`,
      );
    },
  },
];

export function battery(root: string): Battery {
  return new Battery({
    name: 'E-grants',
    port: 18551,
    cases,
    stores: ['euria'],
    tokens: null,
    management: [{ agent: 'gamma-mgr', secret: GAMMA }] satisfies readonly ManagementGrant[],
    root,
  });
}
