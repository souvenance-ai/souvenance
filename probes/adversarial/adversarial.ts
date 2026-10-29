//
// Phase B — adversarial input battery over the real wire. Malformed JSON,
// wrong types, hostile metadata, corrupt cursors, oversized bodies, path
// traversal, unicode/empty strings everywhere, limit/depth runaways.
// Expectation: refusals teach (400 {error}), nothing crashes, nothing 500s.
// The metadata-value probes pin ruling A (#51's B07): trees store and
// leaf-walk, arrays/null/non-finite refuse with the facade's teaching.
//
import {
  Battery,
  type ProbeCase,
  type ProbeRecord,
  type ProbeVerdict,
  fail,
  ok,
  record,
  records,
  req,
} from '../battery/battery.ts';

/** Refusal contract: the status carries the envelope {error: string}. */
function refuses(
  r: { status: number; json: unknown; text: string },
  expectations: number[],
  describe: string,
): ProbeVerdict {
  if (!expectations.includes(r.status))
    return fail(
      `${describe}: expected ${expectations.join('|')}, got ${r.status} ${r.text.slice(0, 200)}`,
    );
  if (r.status === 400 && typeof record(r.json)?.error !== 'string')
    return fail(`${describe}: 400 without {error} envelope: ${r.text.slice(0, 200)}`, 'doc-gap');
  return ok(`${describe} — ${r.status} is in ${expectations.join('|')}`);
}

const memoriesOf = (row: ProbeRecord | null): readonly ProbeRecord[] => records(row?.memories);

const cases: readonly ProbeCase[] = [
  {
    id: 'B01',
    name: 'malformed JSON bodies refuse to teach',
    run: async (b) => {
      for (const [tag, raw] of [
        ['truncated', '{"content":"x","kind":'],
        ['bare word', 'hello'],
        ['array body', '[1,2,3]'],
        ['just null', 'null'],
        ['nul byte', '{"content":"a\u0000b","kind":"note"}'],
      ] as const) {
        const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', { body: raw });
        const verdict = awaits(r, [400, 413, 415], tag);
        if (verdict) return verdict;
      }
      return ok('all malformed bodies taught, none crashed');
    },
  },
  {
    id: 'B02',
    name: 'missing / empty fields teach',
    run: async (b) => {
      for (const [tag, body] of [
        ['no kind', { content: 'x' }],
        ['no content', { kind: 'note' }],
        ['empty content', { content: '', kind: 'note' }],
        ['content null', { content: null, kind: 'note' }],
        ['kind empty', { content: 'x', kind: '' }],
        ['kind null', { content: 'x', kind: null }],
      ] as const) {
        const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
          body: body as object,
        });
        const verdict = awaits(r, [400], tag);
        if (verdict) return verdict;
      }
      return ok('every hole refused with teaching');
    },
  },
  {
    id: 'B03',
    name: 'extra fields tolerated — the wire strips what it does not serve',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: 'x', kind: 'note', armor: true },
      });
      if (made.status !== 201) return fail(`extra key → ${made.status} ${made.text.slice(0, 140)}`);
      return ok(`extra key 'armor' — ${made.status} is in 400|201`);
    },
  },
  {
    id: 'B04',
    name: 'wrong types teach',
    run: async (b) => {
      for (const [tag, body] of [
        ['content number', { content: 42, kind: 'note' }],
        ['content array', { content: ['x'], kind: 'note' }],
        ['kind number', { content: 'x', kind: 42 }],
        ['kind object', { content: 'x', kind: { a: 1 } }],
      ] as const) {
        const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
          body: body as object,
        });
        const verdict = awaits(r, [400], tag);
        if (verdict) return verdict;
      }
      return ok('types refused');
    },
  },
  {
    id: 'B05',
    name: 'kind is a free vocabulary, not an enum',
    run: async (b) => {
      for (const kind of ['dream', 'X1', 'note-2', 'latin1_é']) {
        const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
          body: { content: `kind probe ${kind}`, kind },
        });
        if (r.status !== 201)
          return fail(`kind '${kind}' refused: ${r.status} ${r.text.slice(0, 160)}`, 'doc-gap');
      }
      return ok('four free-kind rows accepted');
    },
  },
  {
    id: 'B06',
    name: 'metadata key grammar refuses hostiles, top-level and nested',
    run: async (b) => {
      for (const [tag, key] of [
        ['dot', 'a.b'],
        ['empty', ''],
        ['space', 'a b'],
        ['dotdot', '..'],
        ['slash', 'a/b'],
        ['dollar', '$'],
        ['unicode', 'clé'],
        ['star', 'a*b'],
      ] as const) {
        const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
          body: { content: 'metadata probe', kind: 'note', metadata: { [key]: 'v' } },
        });
        const verdict = awaits(r, [400], `metadata key ${JSON.stringify(key)}`);
        if (verdict) return verdict;
      }
      const plain = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: 'metadata ok probe', kind: 'note', metadata: { 'a-b_C9': 'v' } },
      });
      if (plain.status !== 201)
        return fail(
          `plain grammar refused: ${plain.status} ${plain.text.slice(0, 160)}`,
          'doc-gap',
        );
      return ok('every hostile key refused, plain keys accepted');
    },
  },
  {
    id: 'B07',
    name: 'metadata value grammar: trees serve, arrays/null refuse (#51 fix)',
    run: async (b) => {
      const tree = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: {
          content: `tree row ${Date.now()}`,
          kind: 'note',
          metadata: { tree: { ab: 9 }, leaf: 'x' },
        },
      });
      if (tree.status !== 201)
        return fail(`tree object refused after the fix: ${tree.status} ${tree.text.slice(0, 160)}`);
      for (const [tag, metadata] of [
        ['array', { tags: ['a', 'b'] }],
        ['nested array', { tree: { deep: ['x'] } }],
        ['null', { owner: null }],
        ['non-finite', { rank: NaN }],
      ] as const) {
        const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
          body: { content: 'x', kind: 'note', metadata },
        });
        if (r.json === null && tag === 'non-finite') {
          // the wire's JSON cannot even carry a NaN literal — the gate holds
          const raw = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
            body: '{"content":"nan case","kind":"note","metadata":{"rank":NaN}}',
          });
          if (raw.status !== 400)
            return fail(`non-finite literal parsed?: ${raw.status} ${raw.text.slice(0, 140)}`);
          continue;
        }
        if (r.status !== 400)
          return fail(
            `metadata ${tag} authored: ${r.status} — the gate undid the ruling? ${r.text.slice(0, 140)}`,
          );
        if (!/metadata values may not be/.test(String(record(r.json)?.error ?? '')))
          return fail(
            `metadata ${tag}: refusal without the teaching: ${String(record(r.json)?.error).slice(0, 140)}`,
          );
      }
      const walked = await req(
        b.server!.url,
        'GET',
        `/stores/alpha/memories?metadata=${encodeURIComponent(JSON.stringify({ 'tree.ab': 9 }))}`,
      );
      const hits = memoriesOf(record(walked.json));
      if (hits.length !== 1 || hits[0]?.id !== record(tree.json)?.id)
        return fail(`tree leaf filter lost: ${walked.status} ${walked.text.slice(0, 160)}`);
      return ok('arrays/null/non-finite refuse with teaching; object trees store and leaf-walk');
    },
  },
  {
    id: 'B08',
    name: 'unicode everywhere round-trips byte-true',
    run: async (b) => {
      for (const [tag, text] of [
        ['emoji', '🧠 memoآ riΟ 🚀'],
        ['rtl', 'مرحبا abc שלום'],
        ['combining', 'édge — combining'],
        ['newlines', 'line1\nline2\r\nline3'],
        ['bom', '\ufeffcloaked'],
        ['quotes', '"p"q\'r\ts'],
      ] as const) {
        const made = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
          body: { content: text, kind: 'note' },
        });
        if (made.status !== 201)
          return fail(`${tag} refused: ${made.status} ${made.text.slice(0, 160)}`);
        const node = record(
          (
            await req(
              b.server!.url,
              'GET',
              `/stores/alpha/memories/${String(record(made.json)?.id)}`,
            )
          ).json,
        );
        if (node?.content !== text)
          return fail(`${tag} round-trip drift: got ${JSON.stringify(node?.content)}`, 'doc-gap');
      }
      return ok('six exotic contents round-trip identical');
    },
  },
  {
    id: 'B09',
    name: 'oversized body → refusal, no hang',
    run: async (b) => {
      const big = 'b'.repeat(1_300_000);
      const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: JSON.stringify({ content: big, kind: 'note' }),
      });
      if (!r.status.toString().startsWith('4'))
        return fail(`oversized body hung or served: ${r.status}`, 'doc-gap');
      if (r.status === 400)
        return fail(
          `oversized refused but 400, the cap serves 413: ${r.text.slice(0, 160)}`,
          'doc-gap',
        );
      const declared = b.document as {
        paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
      };
      const responses = declared.paths?.['/stores/{name}/memories']?.post?.responses ?? {};
      if (!('413' in responses))
        return fail(
          `wire serves 413, /doc declares ${Object.keys(responses).join(',')} only`,
          'doc-gap',
        );
      return ok('413 served and declared');
    },
  },
  {
    id: 'B10',
    name: 'limit adversariale teach',
    run: async (b) => {
      for (const [tag, q] of [
        ['zero', 0],
        ['negative', -1],
        ['over cap', 1001],
        ['float', 2.5],
        ['exponent', 1e15],
        ['huge', 99999999999999999999],
      ] as const) {
        const r = await req(b.server!.url, 'GET', `/stores/alpha/memories?limit=${q}`);
        const verdict = awaits(r, [400], `limit=${tag}`);
        if (verdict) return verdict;
      }
      const capOk = await req(b.server!.url, 'GET', '/stores/alpha/memories?limit=1000');
      if (capOk.status !== 200) return fail(`limit=1000 (cap) refused: ${capOk.status}`, 'doc-gap');
      return ok('hostile limits refused, cap accepted');
    },
  },
  {
    id: 'B11',
    name: 'corrupt cursors refuse, never 500',
    run: async (b) => {
      for (const [tag, after] of [
        ['garbage', '@@@not-base64@@@'],
        ['empty', ''],
        ['plain word', 'rowid-4'],
        ['raw json', encodeURIComponent('{"a":1}')],
        ['url junk', '%2F..%2F..%2Fetc'],
      ] as const) {
        const r = await req(b.server!.url, 'GET', `/stores/alpha/memories?after=${after}`);
        const verdict = awaits(r, [400], `after=${tag}`);
        if (verdict) return verdict;
      }
      return ok('five corrupt cursors taught');
    },
  },
  {
    id: 'B12',
    name: 'cross-store cursor reuse — bloodless',
    run: async (b) => {
      const made = await req(b.server!.url, 'POST', '/stores', { body: { name: 'cursor-other' } });
      if (made.status !== 201) return fail(`probe store: ${made.status}`);
      await req(b.server!.url, 'POST', '/stores/cursor-other/memories', {
        body: { content: `stranger row ${Date.now()}`, kind: 'event' },
      });
      await req(b.server!.url, 'POST', '/stores/cursor-other/memories', {
        body: { content: `stranger row ${Date.now()}`, kind: 'event' },
      });
      const p1 = await req(b.server!.url, 'GET', '/stores/cursor-other/memories?limit=1');
      const reused = await req(
        b.server!.url,
        'GET',
        `/stores/alpha/memories?limit=1&after=${encodeURIComponent(String(record(p1.json)?.next_after))}`,
      );
      if (reused.status === 200) {
        if (
          memoriesOf(record(reused.json)).some((entry) =>
            JSON.stringify(entry).includes('stranger row'),
          )
        ) {
          return fail('foreign cursor served foreign rows into alpha', 'doc-gap');
        }
        return ok(
          `foreign cursor tolerated (serves ${memoriesOf(record(reused.json)).length} of alpha's own rows)`,
        );
      }
      return refuses(reused, [400], 'foreign cursor');
    },
  },
  {
    id: 'B13',
    name: 'deleted-cursor row — gap or clean serve',
    run: async (b) => {
      const gone = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: `page anchor ${Date.now()}`, kind: 'event' },
      });
      const first = await req(b.server!.url, 'GET', '/stores/alpha/memories?limit=1');
      const anchor = String(record(first.json)?.next_after);
      await req(b.server!.url, 'POST', `/stores/alpha/memories/${String(record(gone.json)?.id)}`, {
        body: undefined,
      });
      const next = await req(
        b.server!.url,
        'GET',
        `/stores/alpha/memories?limit=1&after=${encodeURIComponent(anchor)}`,
      );
      return awaits(next, [200, 400], `after (deleted anchor) ${anchor.slice(0, 8)}`);
    },
  },
  {
    id: 'B14',
    name: 'id path traversal refused',
    run: async (b) => {
      for (const [tag, idPart] of [
        ['utf8 slash', encodeURIComponent('../../ etc')],
        ['zero uuid', '00000000-0000-0000-0000-000000000000'],
        ['word', 'null'],
        ['overflow', 'z'.repeat(300)],
        ['embedded slash', '12b19538-1c07-43b4-b471-b518cbae75ad/x'],
      ] as const) {
        const r = await req(b.server!.url, 'GET', `/stores/alpha/memories/${idPart}`);
        const verdict = awaits(r, [400, 404], `id ${tag}`);
        if (verdict) return verdict;
      }
      return ok('path ids refused cleanly');
    },
  },
  {
    id: 'B15',
    name: 'depth runaway pinned at MAX_DEPTH',
    run: async (b) => {
      for (const [tag, depth] of [
        ['overflow', 999999],
        ['negative', -1],
        ['float', 1.5],
        ['zero', 0],
      ] as const) {
        const r = await req(
          b.server!.url,
          'GET',
          `/stores/alpha/memories/${crypto.randomUUID()}?depth=${depth}`,
        );
        const verdict = awaits(r, [400, 404], `depth=${tag}`);
        if (verdict) return verdict;
      }
      return ok('four hostile depths pinned');
    },
  },
  {
    id: 'B16',
    name: 'search q adversarial teach',
    run: async (b) => {
      for (const [tag, q] of [
        ['empty', ''],
        ['bare star', '*'],
        ['bare star2', 'data*'],
        ['fts boolean', 'x" a OR b AND (c)'],
        ['pipe', '|;rm -rf'],
        ['1000-star', '*'.repeat(1000)],
        ['quote-pair', '"unterminated'],
        ['unicode', '日本語 🔍'],
      ] as const) {
        const r = await req(
          b.server!.url,
          'GET',
          `/stores/alpha/search?q=${encodeURIComponent(q)}`,
        );
        const verdict = awaits(r, [200, 400], `q=${tag}`);
        if (verdict) return verdict;
      }
      return ok('all search queries served or taught, no 5xx');
    },
  },
  {
    id: 'B17',
    name: 'duplicate JSON keys — last wins, nothing corrupts',
    run: async (b) => {
      const r = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: '{"content":"dup keys","kind":"note","kind":"the-winner"}',
      });
      const verdict = awaits(r, [400, 201], 'duplicate kind key');
      if (verdict.ok) {
        const node = record(
          (await req(b.server!.url, 'GET', `/stores/alpha/memories/${String(record(r.json)?.id)}`))
            .json,
        );
        if (node?.kind !== 'the-winner')
          return fail(`duplicate keys: served kind ${String(node?.kind)}`, 'doc-gap');
        return ok('last wins — JSON semantics');
      }
      return verdict;
    },
  },
  {
    id: 'B18',
    name: 'pathname store grammar refused at create',
    run: async (b) => {
      for (const name of [
        'ALPHA',
        '1abc',
        'has_underscore',
        'has.dot',
        'has space',
        'a'.repeat(40),
      ]) {
        const r = await req(b.server!.url, 'POST', '/stores', { body: { name } });
        const verdict = awaits(r, [400], `store name ${JSON.stringify(name.slice(0, 12))}`);
        if (verdict) return verdict;
      }
      return ok('six broken names refused');
    },
  },
  {
    id: 'B19',
    name: 'removed surfaces 404, nothing resurrects',
    run: async (b) => {
      for (const [method, path] of [
        ['POST', '/stores/alpha/relations'],
        ['GET', '/stores/alpha/stats'],
        ['DELETE', '/stores/alpha/recover'],
        ['POST', '/stores/alpha/export'],
      ] as const) {
        const r = await req(b.server!.url, method, path, {
          body: method === 'POST' ? {} : undefined,
        });
        const verdict = awaits(r, [404], `${method} ${path}`);
        if (verdict) return verdict;
      }
      return ok('removed routes stay dead');
    },
  },
  {
    id: 'B20',
    name: 'link/hot/supersede/merge adversarial bodies teach',
    run: async (b) => {
      const anchor = await req(b.server!.url, 'POST', '/stores/alpha/memories', {
        body: { content: `anchor ${Date.now()}`, kind: 'event' },
      });
      const id = String(record(anchor.json)?.id);
      if (!uuidLike(id)) return fail('could not seed anchor');
      for (const [tag, method, path, body, expected] of [
        [
          'self link',
          'POST',
          `/stores/alpha/memories/${id}/link`,
          { to: id, kind: 'relates-to' },
          [400, 409],
        ],
        [
          'link missing to',
          'POST',
          `/stores/alpha/memories/${id}/link`,
          { kind: 'relates-to' },
          [400],
        ],
        ['hot wrong type', 'POST', `/stores/alpha/memories/${id}/hot`, { hot: 'yes' }, [400]],
        ['hot missing', 'POST', `/stores/alpha/memories/${id}/hot`, {}, [400]],
        [
          'supersede empty',
          'POST',
          `/stores/alpha/memories/${id}/supersede`,
          { content: '' },
          [400],
        ],
        ['merge empty ids', 'POST', '/stores/alpha/merge', { ids: [], content: 'x' }, [400]],
        [
          'merge duplicate id',
          'POST',
          '/stores/alpha/merge',
          { ids: [id, id], content: 'x' },
          [400],
        ],
        [
          'unlink never-linked',
          'DELETE',
          `/stores/alpha/memories/${id}/link`,
          { to: id },
          [400, 409, 404],
        ],
      ] as const) {
        const r = await req(b.server!.url, method, path, { body: JSON.stringify(body) });
        const verdict = awaits(r, [...expected], tag);
        if (verdict) return verdict;
      }
      return ok('eight adversarial verbs refused by status + envelope');
    },
  },
];

const uuidLike = (value: string): boolean => /^[0-9a-f-]{36}$/.test(value);

function awaits(
  r: { status: number; json: unknown; text: string },
  expectations: number[],
  describe: string,
): ProbeVerdict {
  if (!expectations.includes(r.status))
    return fail(
      `${describe}: expected ${expectations.join('|')}, got ${r.status} ${r.text.slice(0, 220)}`,
    );
  if (r.status === 400 && typeof record(r.json)?.error !== 'string')
    return fail(`${describe}: 400 without {error} envelope: ${r.text.slice(0, 200)}`, 'doc-gap');
  return ok(`${describe} — ${r.status} is in ${expectations.join('|')}`);
}

/** The battery built fresh every run: operator loopback, one growing store. */
export function battery(root: string): Battery {
  return new Battery({ name: 'B-adversarial', port: 18502, cases, stores: ['alpha'], root });
}
