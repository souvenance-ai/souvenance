//
// Phase C — the auth matrix end-to-end (#63): the loopback bypass is
// dead (a bare request is a 401 whatever the peer), ro/rw on every
// write, the management family serving create/list/describe/fork/delete
// and nothing else, bad bearers, the zero-credential boot policy (any
// host), the management-only boot that births a fresh host's first
// store, and the 429 window with its real reset. Credentials: alpha rw,
// beta ro, beta-writer rw (the seeder), gamma = the management token.
//
import {
  Battery,
  Server,
  bearerOf,
  type ManagementToken,
  type ProbeCase,
  type TokenGrant,
  delay,
  fail,
  ok,
  record,
  req,
} from '../battery/battery.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ALPH = 'souv-' + 'a'.repeat(32);
const BET = 'souv-' + 'b'.repeat(32);
const BETW = 'souv-' + 'e'.repeat(32);
const GAMM = 'souv-' + 'c'.repeat(32);

const cases: readonly ProbeCase[] = [
  {
    id: 'C01',
    name: 'the loopback bypass is dead — a bare request refuses 401',
    run: async (b) => {
      const written = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: `freestyle row ${Date.now()}`, kind: 'note' },
      });
      if (written.status !== 401)
        return fail(`bare write → ${written.status} ${written.text.slice(0, 120)}`);
      if (typeof record(written.json)?.error !== 'string')
        return fail(`401 without {error} envelope: ${written.text.slice(0, 120)}`, 'doc-gap');
      const made = await req(b.server!.url, 'POST', '/stores', {
        body: { name: 'freestyle-store' },
      });
      if (made.status !== 401) return fail(`bare manage create → ${made.status}`);
      return ok('the freestyle retired — no token, no memory');
    },
  },
  {
    id: 'C02',
    name: 'rw store grant: write passes, the management surface refuses',
    run: async (b) => {
      const written = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        headers: bearerOf(ALPH),
        body: { content: `alpha rw row ${Date.now()}`, kind: 'note' },
      });
      if (written.status !== 201)
        return fail(`rw write → ${written.status} ${written.text.slice(0, 120)}`);
      const attempt = await req(b.server!.url, 'POST', '/stores', {
        headers: bearerOf(ALPH),
        body: { name: 'rw-manage-attempt' },
      });
      if (attempt.status !== 403)
        return fail(
          `rw grant on create → expected 403, got ${attempt.status} ${attempt.text.slice(0, 120)}`,
        );
      if (typeof record(attempt.json)?.error !== 'string')
        return fail(`403 without {error} envelope: ${attempt.text.slice(0, 120)}`, 'doc-gap');
      return ok('rw serves its store and never the management surface');
    },
  },
  {
    id: 'C03',
    name: 'ro grant: reads pass, every write verb refuses',
    run: async (b) => {
      const seeded = await req(b.server!.url, 'POST', '/stores/beta/memories', {
        headers: bearerOf(BETW),
        body: { content: `ro seed ${Date.now()}`, kind: 'note' },
      });
      if (seeded.status !== 201)
        return fail(`beta seed by the rw grant → ${seeded.status} ${seeded.text.slice(0, 120)}`);
      const target = String(record(seeded.json)?.id);
      for (const [method, path] of [
        ['GET', '/stores/beta/memories'],
        ['GET', '/stores/beta/checkin'],
        ['GET', '/stores/beta/checkout'],
        ['GET', '/stores/beta/search?q=x'],
      ] as const) {
        const r = await req(b.server!.url, method, path, { headers: bearerOf(BET) });
        if (r.status !== 200) return fail(`ro read ${path} → ${r.status} ${r.text.slice(0, 120)}`);
      }
      const writes: readonly (readonly [string, string, object | null, number[]])[] = [
        ['POST', '/stores/beta/memories', { content: 'ro attack', kind: 'noun' }, [403]],
        ['POST', `/stores/beta/memories/${target}/hot`, { hot: true }, [403]],
        ['POST', `/stores/beta/memories/${target}/supersede`, { content: 'ro attack' }, [403]],
        ['POST', `/stores/beta/memories/${target}/deprecate`, {}, [403]],
        ['POST', `/stores/beta/memories/${target}/link`, { to: target, kind: 'relates-to' }, [403]],
        ['DELETE', `/stores/beta/memories/${target}/link`, { to: target }, [403]],
        ['POST', '/stores/beta/merge', { ids: [target], content: 'x' }, [403]],
        ['POST', '/stores/beta/fork', { name: 'ro-fork' }, [403]],
        ['DELETE', '/stores/beta', null, [403]],
        // body-schema ordering probe: a malformed body teaches 400 before the
        // grant pair is judged — schema-then-authZ is the wire's order; assert
        // explicitly so a silent re-order lands on the report next shot.
        ['POST', `/stores/beta/memories/${target}/link`, {}, [400, 403]],
      ];
      for (const [method, path, body, expectedStatuses] of writes) {
        const r = await req(b.server!.url, method as 'GET' | 'POST' | 'DELETE', path, {
          headers: bearerOf(BET),
          body: body ?? undefined,
        });
        if (!expectedStatuses.includes(r.status))
          return fail(
            `ro write ${method} ${path} → ${r.status} ${r.text.slice(0, 140)}`,
            'doc-gap',
          );
        if (typeof record(r.json)?.error !== 'string')
          return fail(`ro write ${method} ${path}: no {error} envelope`, 'doc-gap');
      }
      return ok('reads 200 ×4; writes refused with envelope ×10');
    },
  },
  {
    id: 'C04',
    name: 'grant scope: beta bearer cannot reach alpha',
    run: async (b) => {
      const r = await req(b.server!.url, 'GET', '/stores/alpha/memories', {
        headers: bearerOf(BET),
      });
      if (r.status !== 403)
        return fail(`foreign store read → ${r.status} (${r.text.slice(0, 140)})`);
      return ok('foreign grant refused');
    },
  },
  {
    id: 'C05',
    name: 'the management family: create/list/describe/fork/delete serve',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores', {
        headers: bearerOf(GAMM),
        body: { name: 'gamma-made' },
      });
      if (made.status !== 201)
        return fail(`management create → ${made.status} ${made.text.slice(0, 140)}`);
      const listed = await req(b.server!.url, 'GET', '/stores', { headers: bearerOf(GAMM) });
      if (listed.status !== 200)
        return fail(`management list → ${listed.status} ${listed.text.slice(0, 140)}`, 'doc-gap');
      const described = await req(b.server!.url, 'GET', '/stores/gamma-made', {
        headers: bearerOf(GAMM),
      });
      if (described.status !== 200)
        return fail(`management describe → ${described.status} ${described.text.slice(0, 140)}`);
      const forked = await req(b.server!.url, 'POST', '/stores/gamma-made/fork', {
        headers: bearerOf(GAMM),
        body: { name: 'gamma-fork' },
      });
      if (forked.status !== 201)
        return fail(`management fork → ${forked.status} ${forked.text.slice(0, 140)}`);
      const killedFork = await req(b.server!.url, 'DELETE', '/stores/gamma-fork', {
        headers: bearerOf(GAMM),
      });
      if (killedFork.status !== 204)
        return fail(`management delete fork → ${killedFork.status}`, 'doc-gap');
      const killed = await req(b.server!.url, 'DELETE', '/stores/gamma-made', {
        headers: bearerOf(GAMM),
      });
      if (killed.status !== 204)
        return fail(`management delete → ${killed.status} ${killed.text.slice(0, 140)}`, 'doc-gap');
      return ok('the management family serves create/list/describe/fork/delete');
    },
  },
  {
    id: 'C06',
    name: 'bad bearers and wrong families all refused with envelope',
    run: async (b) => {
      const bare = await req(b.server!.url, 'GET', '/stores/alpha/memories', {});
      if (bare.status !== 401) return fail(`no-header should refuse 401 (#63), got ${bare.status}`);
      const attempts: readonly (readonly [string, Record<string, string> | null])[] = [
        ['wrong scheme', { authorization: `Basic ${ALPH}` }],
        ['unknown secret', { authorization: 'Bearer ' + 'souv-' + 'd'.repeat(32) }],
        ['malformed secret', { authorization: 'Bearer souv-abc' }],
        ['empty bearer', { authorization: 'Bearer ' }],
      ];
      for (const [tag, headers] of attempts) {
        const r = await req(b.server!.url, 'GET', '/stores/alpha/memories', {
          headers: headers ?? {},
        });
        if (r.status !== 401) return fail(`${tag} → ${r.status}`, 'doc-gap');
        if (typeof record(r.json)?.error !== 'string')
          return fail(`${tag}: no {error} envelope: ${r.text.slice(0, 120)}`, 'doc-gap');
      }
      // Wrong family: a management credential on a data route — 403 with
      // the envelope (401 stays strictly identity).
      const family = await req(b.server!.url, 'GET', '/stores/alpha/memories', {
        headers: bearerOf(GAMM),
      });
      if (family.status !== 403)
        return fail(`management token on data → expected 403, got ${family.status}`, 'doc-gap');
      if (typeof record(family.json)?.error !== 'string')
        return fail(`403 without {error} envelope: ${family.text.slice(0, 120)}`, 'doc-gap');
      return ok('five hostile identity attempts + one wrong family refuse with envelope');
    },
  },
  {
    id: 'C07',
    name: 'a zero-credential host refuses at boot — any host',
    run: async (b) => {
      // The cold host: a config with no credentials at all — boot refuses
      // with the teaching (#63: no token, no memory), whatever the bind.
      // The refusal text rides the child's stderr.
      const coldHome = join(b.root, 'binds', 'cold');
      const configDir = join(coldHome, '.souvenance');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.json'), JSON.stringify({ host: '0.0.0.0' }) + '\n');
      const cold = new Server({
        home: coldHome,
        port: b.port + 1,
        logPath: join(b.root, 'logs', 'cold-bind.log'),
      });
      let refusal = null;
      try {
        await cold.boot({}, 4000);
        await cold.stop();
        refusal = 'STILL RUNNING';
      } catch (caught) {
        refusal = String((caught as Error).message);
      }
      if (refusal === null || refusal === 'STILL RUNNING')
        return fail('a zero-credential host booted and stayed serving', 'doc-gap');
      if (!/zero credentials|no token, no memory/i.test(refusal))
        return fail(`refusal text missing the boot policy: ${refusal.slice(0, 240)}`, 'doc-gap');
      return ok('the credential-less host refused with the teaching');
    },
  },
  {
    id: 'C08',
    name: 'a management-only boot serves — a fresh host births its first store',
    run: async (b) => {
      // The bootstrap posture (#63): the config carries the management
      // family alone; the boot serves, the first store is born over
      // HTTP, and the data routes still demand a store grant.
      const freshHome = join(b.root, 'binds', 'fresh');
      const configDir = join(freshHome, '.souvenance');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({ management: [{ agent: 'gamma-mgr', secret: GAMM }] }) + '\n',
      );
      const fresh = new Server({
        home: freshHome,
        port: b.port + 2,
        logPath: join(b.root, 'logs', 'fresh-boot.log'),
      });
      await fresh.boot({}, 7000);
      try {
        const born = await req(fresh.url, 'POST', '/stores', {
          headers: bearerOf(GAMM),
          body: { name: 'first-born' },
        });
        if (born.status !== 201)
          return fail(`first store on a fresh host → ${born.status} ${born.text.slice(0, 140)}`);
        const listed = await req(fresh.url, 'GET', '/stores', { headers: bearerOf(GAMM) });
        if (listed.status !== 200)
          return fail(`the fresh host's registry → ${listed.status}`, 'doc-gap');
        const bare = await req(fresh.url, 'GET', '/stores/first-born/memories', {});
        if (bare.status !== 401)
          return fail(`data without a store grant → ${bare.status}`, 'doc-gap');
        return ok('the fresh host booted management-only, birthed its first store');
      } finally {
        await fresh.stop();
      }
    },
  },
  {
    id: 'C09',
    name: '429: the grant exhausts, the window resets, others stay clean',
    run: async (b) => {
      const storm = await Promise.allSettled(
        Array.from({ length: 130 }, () =>
          req(
            b.server!.url,
            'GET',
            '/stores/alpha/memories?limit=1',
            { headers: bearerOf(ALPH) },
            20_000,
          ),
        ),
      );
      const byStatus = new Map<string, number>();
      for (const shot of storm) {
        const key = shot.status === 'fulfilled' ? String(shot.value?.status ?? 'err') : 'err';
        byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
      }
      const exhausted = byStatus.get('429') ?? 0;
      if (exhausted === 0)
        return fail(`storm left no 429: ${JSON.stringify([...byStatus])}`, 'doc-gap');
      const other = await req(
        b.server!.url,
        'GET',
        '/stores/beta/memories?limit=1',
        { headers: bearerOf(BET) },
        20_000,
      );
      if (other.status !== 200)
        return fail(`other grants punished with alpha: ${other.status}`, 'doc-gap');
      const alive = await req(b.server!.url, 'GET', '/healthz', {}, 8000);
      if (alive.status !== 200) return fail(`healthz suffers the storm: ${alive.status}`);
      const started = Date.now();
      let resetAt: string | null = null;
      while (Date.now() - started < 75_000) {
        const probe = await req(
          b.server!.url,
          'GET',
          '/stores/alpha/memories?limit=1',
          { headers: bearerOf(ALPH) },
          20_000,
        );
        if (probe.status === 200) {
          resetAt = `${((Date.now() - started) / 1000).toFixed(0)}s after the storm`;
          break;
        }
        if (probe.status !== 429) return fail(`during the wait, an unexpected ${probe.status}`);
        await delay(4000);
      }
      if (resetAt === null)
        return fail('the 429 window never reset in 75s — grant stranded', 'doc-gap');
      return ok(
        `storm → 429 ×${exhausted}; window reset ${resetAt}; other grants untouched, the doors stay public`,
      );
    },
  },
];

export function battery(root: string): Battery {
  return new Battery({
    name: 'C-auth-matrix',
    port: 18531,
    cases,
    stores: ['alpha', 'beta'],
    tokens: [
      { agent: 'alpha-rw', secret: ALPH, store: 'alpha', mode: 'rw' },
      { agent: 'beta-ro', secret: BET, store: 'beta', mode: 'ro' },
      { agent: 'beta-writer', secret: BETW, store: 'beta', mode: 'rw' },
    ] satisfies readonly TokenGrant[],
    management: [{ agent: 'gamma-mgr', secret: GAMM }] satisfies readonly ManagementToken[],
    root,
  });
}
