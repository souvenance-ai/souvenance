//
// Phase C — the auth matrix end-to-end: loopback operator, ro/rw on every
// write, manage-less management, bad bearers, the off-loopback bind
// policy, and the 429 window with its real reset. Grants: alpha rw,
// beta ro, gamma ro + manage.
//
import {
  Battery,
  Server,
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
const GAMM = 'souv-' + 'c'.repeat(32);
const bearerOf = (secret: string): Record<string, string> => ({ authorization: `Bearer ${secret}` });

const cases: readonly ProbeCase[] = [
  { id: 'C01', name: 'operator loopback: rw + manage without bearer', run: async (b) => {
      const written = await req(b.server!.url, 'POST', '/stores/alpha/memories', { body: { content: `operator row ${Date.now()}`, kind: 'note' } });
      if (written.status !== 201) return fail(`operator write → ${written.status} ${written.text.slice(0, 120)}`);
      const made = await req(b.server!.url, 'POST', '/stores', { body: { name: 'operator-store' } });
      if (made.status !== 201) return fail(`operator manage create → ${made.status}`);
      return ok('operator writes and manages bare loopback');
  }},
  { id: 'C02', name: 'rw grant: write passes, manage-less refused', run: async (b) => {
      const written = await req(b.server!.url, 'POST', '/stores/alpha/memories', { headers: bearerOf(ALPH), body: { content: `alpha rw row ${Date.now()}`, kind: 'note' } });
      if (written.status !== 201) return fail(`rw write → ${written.status} ${written.text.slice(0, 120)}`);
      const attempt = await req(b.server!.url, 'POST', '/stores', { headers: bearerOf(ALPH), body: { name: 'rw-manage-attempt' } });
      if (attempt.status !== 403) return fail(`rw grant on create → expected 403, got ${attempt.status} ${attempt.text.slice(0, 120)}`);
      if (typeof record(attempt.json)?.error !== 'string') return fail(`403 without {error} envelope: ${attempt.text.slice(0, 120)}`, 'doc-gap');
      return ok('rw reads its store and never manages');
  }},
  { id: 'C03', name: 'ro grant: reads pass, every write verb refuses', run: async (b) => {
      const seeded = await req(b.server!.url, 'POST', '/stores/beta/memories', { body: { content: `ro seed ${Date.now()}`, kind: 'note' } });
      if (seeded.status !== 201) return fail(`ro seed as operator → ${seeded.status}`);
      const target = String(record(seeded.json)?.id);
      for (const [method, path] of [['GET', '/stores/beta/memories'], ['GET', '/stores/beta/checkin'], ['GET', '/stores/beta/checkout'], ['GET', '/stores/beta/search?q=x']] as const) {
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
        const r = await req(b.server!.url, method as 'GET' | 'POST' | 'DELETE', path, { headers: bearerOf(BET), body: body ?? undefined });
        if (!expectedStatuses.includes(r.status)) return fail(`ro write ${method} ${path} → ${r.status} ${r.text.slice(0, 140)}`, 'doc-gap');
        if (typeof record(r.json)?.error !== 'string') return fail(`ro write ${method} ${path}: no {error} envelope`, 'doc-gap');
      }
      return ok('reads 200 ×4; writes refused with envelope ×10');
  }},
  { id: 'C04', name: 'grant scope: beta bearer cannot reach alpha', run: async (b) => {
      const r = await req(b.server!.url, 'GET', '/stores/alpha/memories', { headers: bearerOf(BET) });
      if (r.status !== 403) return fail(`foreign store read → ${r.status} (${r.text.slice(0, 140)})`);
      return ok('foreign grant refused');
  }},
  { id: 'C05', name: 'manage grant: create/list/delete serve', run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores', { headers: bearerOf(GAMM), body: { name: 'gamma-made' } });
      if (made.status !== 201) return fail(`manage create → ${made.status} ${made.text.slice(0, 140)}`);
      const listed = await req(b.server!.url, 'GET', '/stores', { headers: bearerOf(GAMM) });
      if (listed.status !== 200) return fail(`manage list → ${listed.status} ${listed.text.slice(0, 140)}`, 'doc-gap');
      const killed = await req(b.server!.url, 'DELETE', '/stores/gamma-made', { headers: bearerOf(GAMM) });
      if (killed.status !== 204) return fail(`manage delete own create → ${killed.status} ${killed.text.slice(0, 140)}`, 'doc-gap');
      return ok('manage cap serves create/list/delete');
  }},
  { id: 'C06', name: 'bad bearers all refused with envelope', run: async (b) => {
      const operatorByDesign = await req(b.server!.url, 'GET', '/stores/alpha/memories', {});
      if (operatorByDesign.status !== 200) return fail(`no-header loopback should be operator mode (200), got ${operatorByDesign.status}`);
      const attempts: readonly (readonly [string, Record<string, string> | null])[] = [
        ['wrong scheme', { authorization: `Basic ${ALPH}` }],
        ['unknown secret', { authorization: 'Bearer ' + 'souv-' + 'd'.repeat(32) }],
        ['malformed secret', { authorization: 'Bearer souv-abc' }],
        ['empty bearer', { authorization: 'Bearer ' }],
      ];
      for (const [tag, headers] of attempts) {
        const r = await req(b.server!.url, 'GET', '/stores/alpha/memories', { headers: headers ?? {} });
        if (![401, 403].includes(r.status)) return fail(`${tag} → ${r.status}`, 'doc-gap');
        if (typeof record(r.json)?.error !== 'string') return fail(`${tag}: no {error} envelope: ${r.text.slice(0, 120)}`, 'doc-gap');
      }
      return ok('five hostile identity attempts refuse with envelope');
  }},
  { id: 'C07', name: 'off-loopback bind refuses without tokens', run: async (b) => {
      // The open-bind cold host: `host: 0.0.0.0`, tokens [] — boot refuses
      // with the teaching (#19: a server the outside can reach demands
      // grants). The refusal text rides the child's stderr.
      const coldHome = join(b.root, 'binds', 'cold');
      const configDir = join(coldHome, '.souvenance');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.json'), JSON.stringify({ host: '0.0.0.0' }) + '\n');
      const cold = new Server({ home: coldHome, port: b.port + 1, logPath: join(b.root, 'logs', 'cold-bind.log') });
      let refusal = null;
      try {
        await cold.boot({}, 4000);
        await cold.stop();
        refusal = 'STILL RUNNING';
      } catch (caught) {
        refusal = String((caught as Error).message);
      }
      if (refusal === null || refusal === 'STILL RUNNING') return fail('open bind 0.0.0.0 without tokens booted and stayed serving', 'doc-gap');
      if (!/without tokens|demands grants/i.test(refusal)) return fail(`refusal text missing the bind policy: ${refusal.slice(0, 240)}`, 'doc-gap');
      return ok('cold open-bind refused with the teaching');
  }},
  { id: 'C08', name: '429: the grant exhausts, the window resets, others stay clean', run: async (b) => {
      const storm = await Promise.allSettled(Array.from({ length: 130 }, () => req(b.server!.url, 'GET', '/stores/alpha/memories?limit=1', { headers: bearerOf(ALPH) }, 20_000)));
      const byStatus = new Map<string, number>();
      for (const shot of storm) {
        const key = shot.status === 'fulfilled' ? String(shot.value?.status ?? 'err') : 'err';
        byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
      }
      const exhausted = byStatus.get('429') ?? 0;
      if (exhausted === 0) return fail(`storm left no 429: ${JSON.stringify([...byStatus])}`, 'doc-gap');
      const other = await req(b.server!.url, 'GET', '/stores/beta/memories?limit=1', { headers: bearerOf(BET) }, 20_000);
      if (other.status !== 200) return fail(`other grants punished with alpha: ${other.status}`, 'doc-gap');
      const alive = await req(b.server!.url, 'GET', '/healthz', {}, 8000);
      if (alive.status !== 200) return fail(`operator health suffers the storm: ${alive.status}`);
      const started = Date.now();
      let resetAt: string | null = null;
      while (Date.now() - started < 75_000) {
        const probe = await req(b.server!.url, 'GET', '/stores/alpha/memories?limit=1', { headers: bearerOf(ALPH) }, 20_000);
        if (probe.status === 200) {
          resetAt = `${((Date.now() - started) / 1000).toFixed(0)}s after the storm`;
          break;
        }
        if (probe.status !== 429) return fail(`during the wait, an unexpected ${probe.status}`);
        await delay(4000);
      }
      if (resetAt === null) return fail('the 429 window never reset in 75s — grant stranded', 'doc-gap');
      return ok(`storm → 429 ×${exhausted}; window reset ${resetAt}; other grants + operator untouched`);
  }},
];

export function battery(root: string): Battery {
  return new Battery({
    name: 'C-auth-matrix',
    port: 18531,
    cases,
    stores: ['alpha', 'beta', 'gamma'],
    tokens: [
      { agent: 'alpha-rw', secret: ALPH, store: 'alpha', mode: 'rw' },
      { agent: 'beta-ro', secret: BET, store: 'beta', mode: 'ro' },
      { agent: 'gamma-mgr', secret: GAMM, store: 'gamma', mode: 'ro', manage: true },
    ] satisfies readonly TokenGrant[],
    root,
  });
}
