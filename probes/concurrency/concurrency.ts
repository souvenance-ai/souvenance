//
// Phase D — concurrency & lifecycle over the real wire: parallel writers,
// the SIGKILL patient lock (refuses ~30 s, then takeover + durability),
// the second-host refusal, racing stores, racing supersede, the SIGTERM
// handover. The production posture (#63): the probes carry the alpha
// store grant; the store-birthing race carries the management token.
//
import {
  Battery,
  Server,
  bearerHeaders,
  type ManagementGrant,
  type ProbeCase,
  type ProbeRecord,
  type StoreGrant,
  delay,
  fail,
  ok,
  record,
  records,
  requestAs,
} from '../battery/battery.ts';
import { join } from 'node:path';

/** The ambient identity (#63): the battery's alpha store grant. */
const ALPH = 'souv-' + '7'.repeat(32);
const MANAGEMENT_SECRET = 'souv-' + '8'.repeat(32);

const call = requestAs(ALPH);

const teachable = (status: number | string): boolean =>
  ['200', '201', '204', '400', '403', '404', '409'].includes(String(status)) ||
  /^THREW/.test(String(status));

const memoriesOf = (row: ProbeRecord | null): readonly ProbeRecord[] => records(row?.memories);

async function reboot(battery: Battery, port: number, tag: string): Promise<Server> {
  const revived = new Server({
    home: battery.homePath,
    port,
    logPath: join(battery.root, 'logs', `${tag}.log`),
  });
  await revived.boot({}, 9000);
  return revived;
}

const cases: readonly ProbeCase[] = [
  {
    id: 'D01',
    name: '24 parallel writers on one store — all 201, all distinct',
    run: async (b) => {
      const shots = Array.from({ length: 24 }, (_, i) =>
        call(
          b.server!.url,
          'POST',
          '/stores/alpha/memories',
          { body: { content: `parallel ${Date.now()} #${i}`, kind: 'event' } },
          20_000,
        ),
      );
      const landed = await Promise.allSettled(shots);
      const served = landed.filter(
        (shot) => shot.status === 'fulfilled' && shot.value?.status === 201,
      );
      const ids = new Set(served.map((shot) => String(record(shot.value!.json)?.id)));
      if (served.length !== 24) return fail(`${served.length}/24 accepted`, 'doc-gap');
      if (ids.size !== 24) return fail(`id collisions: ${24 - ids.size}`);
      return ok('24 rows, zero contention artifacts');
    },
  },
  {
    id: 'D02',
    name: 'SIGKILL: patient lock (refuses ~30s) then takeover + durability',
    run: async (b) => {
      const gone = await call(
        b.server!.url,
        'POST',
        '/stores/alpha/memories',
        { body: { content: `survives the kill ${Date.now()}`, kind: 'event' } },
        20_000,
      );
      if (gone.status !== 201) return fail(`pre-kill write → ${gone.status}`);
      const doomedId = String(record(gone.json)?.id);
      await b.server!.stop('SIGKILL');
      await delay(300);
      const impatient = new Server({
        home: b.homePath,
        port: b.port + 1,
        logPath: join(b.root, 'logs', 'impatient.log'),
      });
      let teaching: string | null = null;
      try {
        await impatient.boot({}, 2500);
        await impatient.stop();
        teaching = 'booted — no refusal';
      } catch (caught) {
        teaching = String((caught as Error).message);
      }
      if (!/owned by|stale/i.test(teaching))
        return fail(
          `immediate reboot after SIGKILL did not teach the patient lock: ${teaching.slice(0, 200)}`,
          'doc-gap',
        );
      const started = Date.now();
      let revived: Server | null = null;
      let lastError = '';
      while (Date.now() - started < 48_000) {
        try {
          const fresh = new Server({
            home: b.homePath,
            port: b.port + 1,
            logPath: join(b.root, 'logs', 'revive.log'),
          });
          await fresh.boot({}, 3000);
          revived = fresh;
          break;
        } catch (caught) {
          lastError = String((caught as Error).message).slice(0, 160);
          await delay(3000);
        }
      }
      if (revived === null) return fail(`no takeover in 48s: ${lastError}`, 'doc-gap');
      const after = await call(
        revived.url,
        'GET',
        `/stores/alpha/memories/${doomedId}`,
        {},
        20_000,
      );
      if (after.status !== 200) {
        await revived.stop().catch(() => {});
        return fail(
          `row lost across SIGKILL: ${after.status} ${after.text.slice(0, 140)}`,
          'doc-gap',
        );
      }
      // Release the takeover: the next case boots its own host on this home.
      await revived.stop();
      return ok(
        `taught «owned…stale», served again after ${((Date.now() - started) / 1000).toFixed(0)}s, row durably served`,
      );
    },
  },
  {
    id: 'D03',
    name: 'second host on a live home refuses with the lock teaching',
    run: async (b) => {
      const first = new Server({
        home: b.homePath,
        port: b.port,
        logPath: join(b.root, 'logs', 'first.log'),
      });
      await first.boot({}, 9000);
      // The refusing host stops; the surviving one becomes the battery's.
      b.adopt(first);
      const second = new Server({
        home: b.homePath,
        port: b.port + 2,
        logPath: join(b.root, 'logs', 'duel.log'),
      });
      let verdict: string;
      try {
        await second.rawBoot({});
        const started = Date.now();
        while (Date.now() - started < 4000 && second.live) await delay(130);
        verdict = second.exit === null ? 'STILL RUNNING' : `exit ${second.exit}`;
        if (verdict !== 'STILL RUNNING' && !/owned by|stale/i.test(second.servedLog))
          return fail(
            `second host exited without the lock teaching: ${second.servedLog.slice(0, 200)}`,
            'doc-gap',
          );
      } finally {
        await second.stop().catch(() => {});
      }
      return ok(`second host refused: ${verdict}`);
    },
  },
  {
    id: 'D04',
    name: 'create/fork/delete racing one store name — no 500, end-state honest',
    run: async (b) => {
      const name = `race-${Date.now().toString(36)}`;
      const shove = async (
        kind: 'POST' | 'DELETE' | 'GET',
        path: string,
        body: object | undefined,
      ): Promise<{ status: number | string; text: string }> => {
        // The race lives on the management surface — the ops token (#63).
        const exchange = await call(b.server!.url, kind, path, {
          headers: bearerHeaders(MANAGEMENT_SECRET),
          ...(body === undefined ? {} : { body }),
        });
        return { status: exchange.status, text: exchange.text };
      };
      // Settled at construction: an early verdict must not strand the race's
      // later fetches as unhandled rejections.
      const settled = await Promise.allSettled([
        shove('POST', '/stores', { name }),
        shove('POST', `/stores/${name}/fork`, {}),
        shove('POST', '/stores', { name }),
        shove('DELETE', `/stores/${name}`, undefined),
        shove('GET', `/stores/${name}`, undefined),
      ]);
      const landed: (number | string)[] = [];
      for (const shot of settled) {
        if (shot.status === 'rejected') {
          landed.push(
            `THREW ${String((shot.reason as { cause?: { code?: string } })?.cause?.code ?? shot.reason)}`,
          );
          continue;
        }
        landed.push(shot.value.status);
        if (!teachable(shot.value.status))
          return fail(`surfaced unteachable code: ${landed.join(',')}`, 'doc-gap');
      }
      const after = records(
        (
          await call(
            b.server!.url,
            'GET',
            '/stores',
            { headers: bearerHeaders(MANAGEMENT_SECRET) },
            20_000,
          )
        ).json,
      );
      const fresh = after.filter((row) => row.name === name);
      if (fresh.length > 1)
        return fail(`race duplicated the name: ${fresh.length} stores of ${name}`, 'doc-gap');
      const forks = after.filter((row) => row.name === `${name}-fork`).length;
      return ok(
        `codes ${landed.join(',')} — end state: ${fresh.length}×${name}, ${forks}×${name}-fork`,
      );
    },
  },
  {
    id: 'D05',
    name: 'parallel supersede on one living memory — one head, one anchor superseded',
    run: async (b) => {
      const anchor = await call(
        b.server!.url,
        'POST',
        '/stores/alpha/memories',
        { body: { content: `supersede anchor ${Date.now()}`, kind: 'event' } },
        20_000,
      );
      const anchorId = String(record(anchor.json)?.id);
      const revisions = await Promise.allSettled([
        call(
          b.server!.url,
          'POST',
          `/stores/alpha/memories/${anchorId}/supersede`,
          { body: { content: `rev A ${Date.now()}` } },
          20_000,
        ),
        call(
          b.server!.url,
          'POST',
          `/stores/alpha/memories/${anchorId}/supersede`,
          { body: { content: `rev B ${Date.now()}` } },
          20_000,
        ),
      ]);
      const statuses = revisions.map((shot) =>
        shot.status === 'fulfilled'
          ? String(shot.value.status)
          : `THREW ${String((shot.reason as Error)?.message ?? shot.reason)}`,
      );
      const respectable = revisions.every(
        (shot) => shot.status === 'fulfilled' && teachable(shot.value.status),
      );
      const node = record(
        (await call(b.server!.url, 'GET', `/stores/alpha/memories/${anchorId}`, {}, 20_000)).json,
      );
      if (!respectable) return fail(`supersede race surfaced: ${statuses.join(',')}`, 'doc-gap');
      if (node?.status !== 'superseded')
        return fail(`anchor status after race: ${String(node?.status)}`, 'doc-gap');
      const activeRevisions = memoriesOf(
        record(
          (await call(b.server!.url, 'GET', '/stores/alpha/memories?limit=1000', {}, 20_000)).json,
        ),
      ).filter((row) =>
        ['rev A', 'rev B'].some(
          (word) => String(row.content).includes(word) && row.status === 'active',
        ),
      );
      if (activeRevisions.length !== 1)
        return fail(`race left ${activeRevisions.length} active revision heads`, 'doc-gap');
      return ok(`codes ${statuses.join(',')}; anchor superseded; one head permanent`);
    },
  },
  {
    id: 'D06',
    name: 'SIGTERM handover: stop cleanly → boot again serves',
    run: async (b) => {
      await b.server!.stop('SIGTERM');
      const revived = await reboot(b, b.port, 'handover');
      b.adopt(revived);
      const proof = await call(revived.url, 'GET', '/stores/alpha/memories?limit=1', {}, 20_000);
      if (proof.status !== 200)
        return fail(
          `post-TERM reboot refuses: ${proof.status} ${proof.text.slice(0, 120)}`,
          'doc-gap',
        );
      return ok('SIGTERM → reboot → serving');
    },
  },
];

export function battery(root: string): Battery {
  return new Battery({
    name: 'D-concurrency',
    port: 18541,
    cases,
    stores: ['alpha'],
    tokens: [
      { agent: 'alpha-rw', secret: ALPH, store: 'alpha', mode: 'rw' },
    ] satisfies readonly StoreGrant[],
    management: [{ agent: 'ops', secret: MANAGEMENT_SECRET }] satisfies readonly ManagementGrant[],
    root,
  });
}
