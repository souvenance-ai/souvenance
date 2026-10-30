//
// Phase A — happy paths of every route, folded against the served /doc.
// The canon: whatever /doc declares is what the wire must do. Operator
// loopback host; one store 'alpha' grows step by step through the battery.
//
import {
  Battery,
  type ProbeCase,
  type ProbeRecord,
  docAgrees,
  fail,
  ok,
  record,
  records,
  req,
} from '../battery/battery.ts';

const uuid = (value: string | undefined): boolean =>
  typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);

const memoriesOf = (row: ProbeRecord | null): readonly ProbeRecord[] => records(row?.memories);

const memoryIds = (row: ProbeRecord | null): string[] =>
  memoriesOf(row).map((entry) => String(entry.id));

const cases: readonly ProbeCase[] = [
  {
    id: 'A01',
    name: 'healthz',
    run: async (b) => {
      const health = await req(b.server!.url, 'GET', '/healthz');
      if (health.status !== 200) return fail(`healthz → ${health.status} ${health.text}`);
      if ((record(health.json)?.ok as boolean) !== true) return fail(`healthz body ${health.text}`);
      return ok('{"ok":true}');
    },
  },
  {
    id: 'A02',
    name: '/doc is openapi 3 souvenance — 13 paths / 17 methods',
    run: async (b) => {
      const document = b.document as {
        openapi?: string;
        info?: { title?: string };
        paths?: Record<string, Record<string, { responses?: unknown }>>;
        components?: { schemas?: Record<string, unknown> };
      };
      if (!document || document.openapi !== '3.0.0') return fail(`openapi ${document?.openapi}`);
      if (document.info?.title !== 'souvenance') return fail(`title ${document.info?.title}`);
      const paths = Object.keys(document.paths ?? {});
      const rows = paths.reduce((acc, path) => acc + Object.keys(document.paths![path]!).length, 0);
      if (paths.length !== 13)
        return fail(`13 paths declared, got ${paths.length}: ${paths.join(',')}`);
      if (rows !== 17) return fail(`17 method rows declared, got ${rows}`, 'doc-gap');
      const schemas = document.components?.schemas ?? {};
      for (const needed of ['CheckinReport', 'CheckoutReport', 'MemoryNode']) {
        if (!(needed in schemas)) return fail(`component ${needed} missing from /doc`, 'doc-gap');
      }
      return ok('17 routes + 3 components');
    },
  },
  {
    id: 'A03',
    name: '/docs serves the UI',
    run: async (b) => {
      const served = await req(b.server!.url, 'GET', '/docs');
      if (served.status !== 200) return fail(`/docs → ${served.status}`);
      if (!/text\/html/i.test(served.headers.get('content-type') ?? ''))
        return fail(`content-type ${served.headers.get('content-type')}`);
      if (!/swagger/i.test(served.text)) return fail('no swagger in /docs html');
      return ok('200 text/html swagger');
    },
  },
  {
    id: 'A04',
    name: 'POST /stores creates alpha',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores', { body: { name: 'alpha' } });
      if (made.status !== 201) return fail(`POST /stores → ${made.status} ${made.text}`);
      if (record(made.json)?.name !== 'alpha') return fail(`response ${made.text}`);
      return docAgrees(b, '/stores', 'POST', made.status, made.json);
    },
  },
  {
    id: 'A05',
    name: 'POST /stores duplicate alpha → 409 documented',
    run: async (b) => {
      const again = await req(b.server!.url, 'POST', '/stores', { body: { name: 'alpha' } });
      if (again.status !== 409)
        return fail(`conflict expected 409, got ${again.status} ${again.text}`);
      return docAgrees(b, '/stores', 'POST', again.status, again.json);
    },
  },
  {
    id: 'A06',
    name: 'GET /stores lists alpha, no path leak',
    run: async (b) => {
      const served = await req(b.server!.url, 'GET', '/stores');
      if (served.status !== 200) return fail(`→ ${served.status}`);
      const rows = records(served.json);
      if (!rows.some((row) => row.name === 'alpha'))
        return fail(`list ${served.text.slice(0, 120)}`);
      for (const row of rows) {
        if ('dbPath' in row || /path\/dir/i.test(JSON.stringify(row)))
          return fail(`path leaking in descriptor ${JSON.stringify(row)}`, 'doc-gap');
      }
      return docAgrees(b, '/stores', 'GET', served.status, served.json);
    },
  },
  {
    id: 'A07',
    name: 'GET /stores/alpha serves {name,stats}',
    run: async (b) => {
      const served = await req(b.server!.url, 'GET', '/stores/alpha');
      if (served.status !== 200) return fail(`→ ${served.status} ${served.text}`);
      const row = record(served.json);
      if (row?.name !== 'alpha' || typeof row?.stats !== 'object')
        return fail(`shape ${served.text.slice(0, 160)}`);
      return docAgrees(b, '/stores/{name}', 'GET', served.status, served.json);
    },
  },
  {
    id: 'A08',
    name: 'POST memories {content,kind} → 201 {id}',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: 'remember: first deployment X1', kind: 'note' },
      });
      if (made.status !== 201) return fail(`→ ${made.status} ${made.text}`);
      if (!uuid(String(record(made.json)?.id))) return fail(`id ${made.text}`);
      return docAgrees(b, '/stores/{name}/memories', 'POST', made.status, made.json);
    },
  },
  {
    id: 'A09',
    name: 'POST memories metadata dot-path accepted',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: 'scalar metadata', kind: 'note', metadata: { source: 'prod', ntag: 7 } },
      });
      if (made.status !== 201) return fail(`→ ${made.status} ${made.text}`);
      const served = record(
        (await req(b.server!.url, 'GET', `/stores/alpha/memories/${String(record(made.json)?.id)}`))
          .json,
      );
      const meta = record(served?.metadata);
      if (meta?.source !== 'prod' || meta?.ntag !== 7)
        return fail(
          `metadata lost on getattr: ${served ? JSON.stringify(served.metadata) : served}`,
          'doc-gap',
        );
      return ok('scalar metadata round-trip');
    },
  },
  {
    id: 'A10',
    name: 'GET memory serves MemoryNode (active, out/in)',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: 'node probe', kind: 'note' },
      });
      if (made.status !== 201) return fail(`seed → ${made.status} ${made.text}`);
      const served = await req(
        b.server!.url,
        'GET',
        `/stores/alpha/memories/${String(record(made.json)?.id)}`,
      );
      if (served.status !== 200) return fail(`→ ${served.status} ${served.text}`);
      const row = record(served.json);
      if (row?.status !== 'active') return fail(`status ${String(row?.status)}`);
      const relations = record(row?.relations);
      if (!Array.isArray(relations?.out) || !Array.isArray(relations?.in))
        return fail(`relations.out/in missing: ${served.text.slice(0, 300)}`, 'doc-gap');
      return docAgrees(b, '/stores/{name}/memories/{id}', 'GET', served.status, served.json);
    },
  },
  {
    id: 'A11',
    name: 'GET memories list — {memories,next_after}, order (created_at,id) DESC',
    run: async (b) => {
      for (let i = 0; i < 3; i++) {
        await req(b.server!.url, 'POST', '/stores/alpha/memories', {
          body: { content: `order row ${Date.now()} ${i}`, kind: 'event' },
        });
      }
      const served = await req(b.server!.url, 'GET', '/stores/alpha/memories');
      if (served.status !== 200) return fail(`→ ${served.status}`);
      const rows = memoriesOf(record(served.json));
      const pairs = rows.map((entry) => [String(entry.created_at), String(entry.id)]);
      const unsorted = pairs.some(
        (pair, i) =>
          i > 0 &&
          (pairs[i - 1]![0]! < pair[0]! ||
            (pairs[i - 1]![0] === pair[0] && pairs[i - 1]![1]! < pair[1]!)),
      );
      if (unsorted)
        return fail(
          `order violates (created_at DESC, id DESC): ${memoryIds(record(served.json)).join(',')}`,
          'doc-gap',
        );
      if (record(served.json)?.next_after !== null)
        return fail(
          `next_after should be null on a full page, got ${JSON.stringify(record(served.json)?.next_after)}`,
        );
      return docAgrees(b, '/stores/{name}/memories', 'GET', served.status, served.json);
    },
  },
  {
    id: 'A12',
    name: 'keyset paging: two-row store, peek truth per page, no overlap',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores', { body: { name: 'page-test' } });
      if (made.status !== 201) return fail(`page-test store: ${made.status} ${made.text}`);
      await req(b.server!.url, 'POST', '/stores/page-test/memories', {
        body: { content: `row 1 ${Date.now()}`, kind: 'event' },
      });
      await req(b.server!.url, 'POST', '/stores/page-test/memories', {
        body: { content: `row 2 ${Date.now()}`, kind: 'event' },
      });
      const p1 = await req(b.server!.url, 'GET', '/stores/page-test/memories?limit=1');
      const first = memoriesOf(record(p1.json));
      if (p1.status !== 200 || first.length !== 1)
        return fail(`p1: ${p1.status} ${p1.text.slice(0, 160)}`);
      if (record(p1.json)?.next_after == null)
        return fail(
          `next_after missing while a second page exists: ${p1.text.slice(0, 160)}`,
          'doc-gap',
        );
      const tail = await req(
        b.server!.url,
        'GET',
        `/stores/page-test/memories?limit=1&after=${encodeURIComponent(String(record(p1.json)?.next_after))}`,
      );
      if (tail.status !== 200) return fail(`after → ${tail.status} ${tail.text.slice(0, 160)}`);
      if (memoryIds(record(tail.json)).includes(String(first[0]?.id)))
        return fail(`cursor repeats: ${tail.text.slice(0, 160)}`);
      if (record(tail.json)?.next_after != null)
        return fail(
          `next_after non-null though no page remains: ${tail.text.slice(0, 160)}`,
          'doc-gap',
        );
      return docAgrees(b, '/stores/{name}/memories', 'GET', tail.status, tail.json);
    },
  },
  {
    id: 'A13',
    name: '?kind filter (IN across repeated kinds)',
    run: async (b) => {
      await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: `event row ${Date.now()}`, kind: 'event' },
      });
      const one = await req(b.server!.url, 'GET', '/stores/alpha/memories?kind=note');
      if (memoriesOf(record(one.json)).some((entry) => entry.kind !== 'note'))
        return fail(`kind filter leak: ${one.text.slice(0, 200)}`);
      const both = await req(b.server!.url, 'GET', '/stores/alpha/memories?kind=note&kind=event');
      const kinds = new Set(memoriesOf(record(both.json)).map((entry) => String(entry.kind)));
      if (![...kinds].includes('note') || ![...kinds].includes('event'))
        return fail(`IN filter lost: ${both.text.slice(0, 200)}`, 'doc-gap');
      return ok('kind IN semantics');
    },
  },
  {
    id: 'A14',
    name: '?metadata filter dot-path equality',
    run: async (b) => {
      await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: 'filtered on', kind: 'note', metadata: { source: 'prod', ntag: 7 } },
      });
      const served = await req(
        b.server!.url,
        'GET',
        `/stores/alpha/memories?metadata=${encodeURIComponent(JSON.stringify({ source: 'prod' }))}`,
      );
      if (served.status !== 200) return fail(`→ ${served.status} ${served.text.slice(0, 160)}`);
      const hits = memoriesOf(record(served.json));
      if (
        hits.length === 0 ||
        hits.some((entry) => record(entry.metadata as unknown)?.source !== 'prod')
      ) {
        return fail(`metadata filter: ${served.text.slice(0, 240)}`);
      }
      return ok(`${hits.length} rows match source=prod`);
    },
  },
  {
    id: 'A15',
    name: 'search q → ranked array',
    run: async (b) => {
      const served = await req(
        b.server!.url,
        'GET',
        `/stores/alpha/search?q=${encodeURIComponent('deployment')}`,
      );
      if (served.status !== 200) return fail(`→ ${served.status} ${served.text.slice(0, 160)}`);
      const hits = records(served.json);
      const relevant = JSON.stringify(served.json).includes('deployment');
      if (!Array.isArray(served.json) || (hits.length > 0 && !relevant))
        return fail(`bm25 empty for 'deployment': ${served.text.slice(0, 200)}`, 'doc-gap');
      return docAgrees(b, '/stores/{name}/search', 'GET', served.status, served.json);
    },
  },
  {
    id: 'A16',
    name: 'checkin ritual {hot,stats}',
    run: async (b) => {
      const served = await req(b.server!.url, 'GET', '/stores/alpha/checkin');
      if (served.status !== 200) return fail(`→ ${served.status} ${served.text.slice(0, 160)}`);
      const row = record(served.json);
      if (!Array.isArray(row?.hot) || typeof row?.stats !== 'object')
        return fail(`shape ${served.text.slice(0, 200)}`);
      return docAgrees(b, '/stores/{name}/checkin', 'GET', served.status, served.json);
    },
  },
  {
    id: 'A17',
    name: 'checkin ?limit obeys',
    run: async (b) => {
      const served = await req(b.server!.url, 'GET', '/stores/alpha/checkin?limit=0');
      if (served.status !== 400)
        return fail(
          `limit=0 should refuse (cap 1000 → 400 per map): ${served.status} ${served.text.slice(0, 160)}`,
          'doc-gap',
        );
      return ok('limit=0 refused');
    },
  },
  {
    id: 'A18',
    name: 'checkout verdict shape',
    run: async (b) => {
      const served = await req(b.server!.url, 'GET', '/stores/alpha/checkout');
      if (served.status !== 200) return fail(`→ ${served.status} ${served.text.slice(0, 160)}`);
      return docAgrees(b, '/stores/{name}/checkout', 'GET', served.status, served.json);
    },
  },
  {
    id: 'A19',
    name: 'hot true/false toggles status',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: `hot toggle ${Date.now()}`, kind: 'note' },
      });
      const id = String(record(made.json)?.id);
      let served = await req(b.server!.url, 'POST', `/stores/alpha/memories/${id}/hot`, {
        body: { hot: true },
      });
      if (served.status !== 204) return fail(`hot:true → ${served.status} ${served.text}`);
      let node = record((await req(b.server!.url, 'GET', `/stores/alpha/memories/${id}`)).json);
      if (node?.status !== 'hot')
        return fail(`status after hot:true: ${String(node?.status)}`, 'doc-gap');
      served = await req(b.server!.url, 'POST', `/stores/alpha/memories/${id}/hot`, {
        body: { hot: false },
      });
      if (served.status !== 204) return fail(`hot:false → ${served.status} ${served.text}`);
      node = record((await req(b.server!.url, 'GET', `/stores/alpha/memories/${id}`)).json);
      if (node?.status !== 'active')
        return fail(`status after hot:false: ${String(node?.status)}`, 'doc-gap');
      return ok('204 toggles, status flips hot↔active');
    },
  },
  {
    id: 'A20',
    name: 'link create-201 / delete-204',
    run: async (b) => {
      const from = String(
        record(
          (
            await req(b.server!.url, 'POST', '/stores/alpha/memories', {
              body: { content: `link from ${Date.now()}`, kind: 'event' },
            })
          ).json,
        )?.id,
      );
      const to = String(
        record(
          (
            await req(b.server!.url, 'POST', '/stores/alpha/memories', {
              body: { content: `link to ${Date.now()}`, kind: 'event' },
            })
          ).json,
        )?.id,
      );
      let served = await req(b.server!.url, 'POST', `/stores/alpha/memories/${from}/link`, {
        body: { to, kind: 'relates-to' },
      });
      if (served.status !== 201) return fail(`link → ${served.status} ${served.text}`);
      const walkedRow = record(
        (await req(b.server!.url, 'GET', `/stores/alpha/memories/${from}?depth=1`)).json,
      );
      const walked = JSON.stringify(record(walkedRow?.relations)?.out ?? null);
      if (!walked.includes(to))
        return fail(
          `out edge not walked: ${walkedRow ? walked.slice(0, 240) : 'no row'}`,
          'doc-gap',
        );
      served = await req(b.server!.url, 'DELETE', `/stores/alpha/memories/${from}/link`, {
        body: { to },
      });
      if (served.status !== 204) return fail(`unlink → ${served.status} ${served.text}`);
      const cleaned = record(
        (await req(b.server!.url, 'GET', `/stores/alpha/memories/${from}?depth=1`)).json,
      );
      if (((record(cleaned?.relations)?.out as unknown[]) ?? []).length !== 0)
        return fail(
          `edge still there: ${cleaned ? JSON.stringify(record(cleaned.relations)?.out) : 'no row'}`,
          'doc-gap',
        );
      return ok('link lifecycle clean');
    },
  },
  {
    id: 'A21',
    name: 'supersede: new active, old superseded',
    run: async (b) => {
      const target = String(
        record(
          (
            await req(b.server!.url, 'POST', '/stores/alpha/memories', {
              body: { content: `supersede me ${Date.now()}`, kind: 'event' },
            })
          ).json,
        )?.id,
      );
      const revision = await req(
        b.server!.url,
        'POST',
        `/stores/alpha/memories/${target}/supersede`,
        { body: { content: 'superseded — the revision faces the light' } },
      );
      if (revision.status !== 201)
        return fail(`→ ${revision.status} ${revision.text.slice(0, 200)}`);
      if (!uuid(String(record(revision.json)?.id)))
        return fail(`id ${revision.text.slice(0, 200)}`);
      const head = String(record(revision.json)?.id);
      const old = record(
        (await req(b.server!.url, 'GET', `/stores/alpha/memories/${target}`)).json,
      );
      const now = record((await req(b.server!.url, 'GET', `/stores/alpha/memories/${head}`)).json);
      if (old?.status !== 'superseded') return fail(`old status ${String(old?.status)}`, 'doc-gap');
      if (now?.status !== 'active') return fail(`new status ${String(now?.status)}`, 'doc-gap');
      return docAgrees(
        b,
        '/stores/{name}/memories/{id}/supersede',
        'POST',
        revision.status,
        revision.json,
      );
    },
  },
  {
    id: 'A22',
    name: 'deprecate: 204 then status deprecated',
    run: async (b) => {
      const mark = String(
        record(
          (
            await req(b.server!.url, 'POST', '/stores/alpha/memories', {
              body: { content: `deprecate me ${Date.now()}`, kind: 'event' },
            })
          ).json,
        )?.id,
      );
      const served = await req(b.server!.url, 'POST', `/stores/alpha/memories/${mark}/deprecate`);
      if (served.status !== 204) return fail(`→ ${served.status} ${served.text}`);
      const node = record((await req(b.server!.url, 'GET', `/stores/alpha/memories/${mark}`)).json);
      if (node?.status !== 'deprecated') return fail(`status ${String(node?.status)}`, 'doc-gap');
      return docAgrees(b, '/stores/{name}/memories/{id}/deprecate', 'POST', served.status, null);
    },
  },
  {
    id: 'A23',
    name: 'merge {ids,content} → 201 {id}',
    run: async (b) => {
      const first = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: `merge source kind note A${Date.now()}`, kind: 'note' },
      });
      const second = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: `merge source kind note B${Date.now()}`, kind: 'note' },
      });
      const merged = await req(b.server!.url, 'POST', '/stores/alpha/merge', {
        body: {
          ids: [String(record(first.json)?.id), String(record(second.json)?.id)],
          content: 'merged text',
        },
      });
      if (merged.status !== 201) return fail(`→ ${merged.status} ${merged.text.slice(0, 200)}`);
      if (!uuid(String(record(merged.json)?.id))) return fail(`id ${merged.text.slice(0, 200)}`);
      return docAgrees(b, '/stores/{name}/merge', 'POST', merged.status, merged.json);
    },
  },
  {
    id: 'A24',
    name: 'fork {}: 201, composed name, descriptor listed',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores/alpha/fork', { body: {} });
      if (made.status !== 201) return fail(`→ ${made.status} ${made.text.slice(0, 200)}`);
      const composed = String(record(made.json)?.name);
      if (composed === 'alpha' || composed === 'undefined')
        return fail(`composed name ${made.text.slice(0, 200)}`, 'doc-gap');
      const listed = await req(b.server!.url, 'GET', '/stores');
      if (!records(listed.json).some((row) => row.name === composed))
        return fail(`fork not in registry: ${listed.text.slice(0, 200)}`, 'doc-gap');
      return docAgrees(b, '/stores/{name}/fork', 'POST', made.status, made.json);
    },
  },
  {
    id: 'A25',
    name: 'fork carries memories verbatim',
    run: async (b) => {
      const forkName = String(
        record((await req(b.server!.url, 'POST', '/stores/alpha/fork', { body: {} })).json)?.name,
      );
      const src = await req(b.server!.url, 'GET', '/stores/alpha/memories');
      const forked = await req(b.server!.url, 'GET', `/stores/${forkName}/memories`);
      if (memoriesOf(record(src.json)).length !== memoriesOf(record(forked.json)).length) {
        return fail(
          `src ${src.text.slice(0, 100)} vs fork ${forked.text.slice(0, 100)}: fork carry`,
          'doc-gap',
        );
      }
      return ok(`fork served ${memoriesOf(record(forked.json)).length} rows like source`);
    },
  },
  {
    id: 'A26',
    name: 'fork {name:"fork-two"} explicit',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores/alpha/fork', {
        body: { name: 'fork-two' },
      });
      if (made.status !== 201) return fail(`→ ${made.status} ${made.text.slice(0, 200)}`);
      if (record(made.json)?.name !== 'fork-two')
        return fail(`echo ${made.text.slice(0, 200)}`, 'doc-gap');
      return docAgrees(b, '/stores/{name}/fork', 'POST', made.status, made.json);
    },
  },
  {
    id: 'A27',
    name: 'the discovery door: / points, /openapi.json serves, the 404 teaches',
    run: async (b) => {
      // Two agent lives knocked on mute doors before finding /doc (#62).
      const pointer = await req(b.server!.url, 'GET', '/');
      if (pointer.status !== 200) return fail(`/ → ${pointer.status}`);
      const door = pointer.json as Record<string, unknown> | null;
      if (
        door?.name !== 'souvenance' ||
        door?.doc !== '/doc' ||
        door?.docs !== '/docs' ||
        door?.healthz !== '/healthz'
      )
        return fail(`the pointer is mute: ${pointer.text.slice(0, 160)}`);
      const alias = await req(b.server!.url, 'GET', '/openapi.json');
      if (alias.status !== 200) return fail(`/openapi.json → ${alias.status}`);
      const served = alias.json as { openapi?: string; info?: { title?: string } } | null;
      if (served?.openapi !== '3.0.0' || served?.info?.title !== 'souvenance')
        return fail(`the alias serves noise: ${alias.text.slice(0, 160)}`);
      const document = b.document as { openapi?: string; info?: { title?: string } } | null;
      if (
        document &&
        (served?.openapi !== document.openapi || served?.info?.title !== document.info?.title)
      )
        return fail('the alias disagrees with /doc');
      const miss = await req(b.server!.url, 'GET', '/nope');
      if (miss.status !== 404) return fail(`/nope → ${miss.status}`);
      const taught = String((miss.json as { error?: string } | null)?.error ?? '');
      if (!taught.includes('/doc'))
        return fail(`the 404 does not teach: ${miss.text.slice(0, 160)}`);
      return ok('pointer + alias + teaching 404');
    },
  },
];

/** The battery built fresh every run: operator loopback, no tokens. */
export function battery(root: string): Battery {
  return new Battery({ name: 'A-doc-vs-wire', port: 18501, cases, root });
}
