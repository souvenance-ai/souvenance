import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import type { TokenGrant } from '../config/config.ts';
import { createApp } from './server.ts';
import { Registry } from './registry/registry.ts';

const SECRET_RW = `souv-${'4'.repeat(32)}`;
const SECRET_RO = `souv-${'5'.repeat(32)}`;
const OTHER_SECRET = `souv-${'6'.repeat(32)}`;
const TOKENS: readonly TokenGrant[] = [
  { agent: 'atlas', secret: SECRET_RW, store: 'atlas', mode: 'rw' },
  { agent: 'reader', secret: SECRET_RO, store: 'atlas', mode: 'ro' },
  { agent: 'other', secret: OTHER_SECRET, store: 'other', mode: 'rw' },
];

const RW = { 'content-type': 'application/json', authorization: `Bearer ${SECRET_RW}` };
const RO = { 'content-type': 'application/json', authorization: `Bearer ${SECRET_RO}` };

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-writes-test-'));
}

function boot(dir: string) {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: TOKENS, version: 'test' });
  return { registry, app };
}

async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = RW,
): Promise<{ status: number; body: any }> {
  const res = await app.request(
    path,
    {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('create answers 201 with the id — the memory serves, relations rode the one gesture', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const target = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'the target',
      kind: 'note',
    });
    assert.equal(target.status, 201);
    const created = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'the source',
      kind: 'note',
      summary: 'condensed',
      metadata: { project: 'x' },
      relations: [{ to: (target.body as { id: string }).id, kind: 'references' }],
    });
    assert.equal(created.status, 201);
    const id = (created.body as { id: string }).id;
    assert.match(id, /^[0-9a-f-]{36}$/);
    const served = await call(app, 'GET', `/stores/atlas/memories/${id}`);
    assert.equal(served.body.content, 'the source');
    assert.equal(served.body.summary, 'condensed');
    assert.deepEqual(served.body.metadata, { project: 'x' });
    assert.equal(served.body.relations.out[0].to_id, (target.body as { id: string }).id);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the oversized body serves 413 — the /doc declares what the wire serves (#51 B09)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const oversize = await call(
      app,
      'POST',
      '/stores/atlas/memories',
      JSON.stringify({ content: 'x'.repeat(1_300_000), kind: 'note' }),
    );
    assert.equal(oversize.status, 413);
    assert.match((oversize.body as { error: string }).error, /body exceeds 1048576 bytes/);
    const doc = await app.request('/doc');
    const declared = (
      (await doc.json()) as {
        paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
      }
    ).paths['/stores/{name}/memories']['post'].responses;
    assert.ok(
      '413' in declared,
      `/doc must declare 413 on the body routes, has ${Object.keys(declared).join(',')}`,
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('create refuses non-scalar metadata values — the one grammar, both surfaces (#51)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const arrayValue = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x',
      kind: 'note',
      metadata: { tags: ['a', 'b'] },
    });
    assert.equal(arrayValue.status, 400);
    assert.match((arrayValue.body as { error: string }).error, /may not be arrays/);
    const nullValue = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x',
      kind: 'note',
      metadata: { owner: null },
    });
    assert.equal(nullValue.status, 400);
    assert.match((nullValue.body as { error: string }).error, /may not be null/);
    const nestedOk = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x',
      kind: 'note',
      metadata: { tree: { ab: 9, mark: 'z' } },
    });
    assert.equal(nestedOk.status, 201);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('create refusals ride the facade teaching — kind, metadata.kind, summary ceiling', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const noKind = await call(app, 'POST', '/stores/atlas/memories', { content: 'x' });
    assert.equal(noKind.status, 400);
    // The schema speaks first (the document says kind required) — the
    // facade's richer teaching keeps the cases the schema lets through.
    assert.match((noKind.body as { error: string }).error, /kind/);
    const kindInMetadata = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x',
      kind: 'note',
      metadata: { kind: 'note' },
    });
    assert.equal(kindInMetadata.status, 400);
    assert.match((kindInMetadata.body as { error: string }).error, /kind is a column/);
    const longContent = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x'.repeat(401),
      kind: 'note',
    });
    assert.equal(longContent.status, 400);
    assert.match((longContent.body as { error: string }).error, /provide a summary/);
    const emptyContent = await call(app, 'POST', '/stores/atlas/memories', {
      content: '',
      kind: 'note',
    });
    assert.equal(emptyContent.status, 400);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown body keys refuse 400 naming the key — the wire teaches, never strips (#60)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const unknown = await call(app, 'POST', '/stores/atlas/memories', {
      title: 'a v0.1 habit',
      content: 'x',
      kind: 'note',
    });
    assert.equal(unknown.status, 400);
    assert.match((unknown.body as { error: string }).error, /title/);
    const nested = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x',
      kind: 'note',
      relations: [{ to: '00000000-0000-4000-8000-000000000000', kind: 'references', armor: true }],
    });
    assert.equal(nested.status, 400);
    assert.match((nested.body as { error: string }).error, /armor/);
    const doc = await app.request('/doc');
    const declared = (
      (await doc.json()) as {
        paths: Record<
          string,
          Record<
            string,
            {
              requestBody: { content: { 'application/json': { schema: Record<string, unknown> } } };
            }
          >
        >;
      }
    ).paths['/stores/{name}/memories']['post'].requestBody.content['application/json'].schema;
    assert.equal(
      declared['additionalProperties'],
      false,
      '/doc must declare the strict bodies, got ' + JSON.stringify(declared).slice(0, 200),
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('supersede answers 201 with the successor id — the old one leaves the living set', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const first = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'old',
      kind: 'note',
    });
    const oldId = (first.body as { id: string }).id;
    const superseded = await call(app, 'POST', `/stores/atlas/memories/${oldId}/supersede`, {
      content: 'new',
      kind: 'decision',
    });
    assert.equal(superseded.status, 201);
    const newId = (superseded.body as { id: string }).id;
    assert.notEqual(newId, oldId);
    const living = await call(app, 'GET', '/stores/atlas/memories');
    assert.deepEqual(
      (living.body as { memories: { id: string }[] }).memories.map((memory) => memory.id),
      [newId],
    );
    const reclassified = await call(app, 'GET', `/stores/atlas/memories/${newId}`);
    assert.equal(
      (reclassified.body as { kind: string }).kind,
      'decision',
      'the revision reclassified',
    );
    assert.equal(
      (
        await call(
          app,
          'POST',
          '/stores/atlas/memories/00000000-0000-4000-8000-000000000000/supersede',
          { content: 'x' },
        )
      ).status,
      404,
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deprecate and hot answer 204; a second deprecate fights the status (409)', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const created = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x',
      kind: 'note',
    });
    const id = (created.body as { id: string }).id;
    assert.equal((await call(app, 'POST', `/stores/atlas/memories/${id}/deprecate`)).status, 204);
    const again = await call(app, 'POST', `/stores/atlas/memories/${id}/deprecate`);
    assert.equal(again.status, 409);
    assert.match((again.body as { error: string }).error, /status 'deprecated'/);
    // hot on a terminal fights the machine; on a living memory it lands.
    assert.equal(
      (await call(app, 'POST', `/stores/atlas/memories/${id}/hot`, { hot: true })).status,
      409,
    );
    const other = await call(app, 'POST', '/stores/atlas/memories', { content: 'y', kind: 'note' });
    const otherId = (other.body as { id: string }).id;
    assert.equal(
      (await call(app, 'POST', `/stores/atlas/memories/${otherId}/hot`, { hot: true })).status,
      204,
    );
    assert.equal(
      (await call(app, 'POST', `/stores/atlas/memories/${otherId}/hot`, { hot: false })).status,
      204,
    );
    assert.equal(
      (
        await call(
          app,
          'POST',
          `/stores/atlas/memories/00000000-0000-4000-8000-000000000000/deprecate`,
        )
      ).status,
      404,
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('link echoes the edge (201); unlink takes the body and answers 204', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const from = (
      await call(app, 'POST', '/stores/atlas/memories', { content: 'from', kind: 'note' })
    ).body as { id: string };
    const to = (await call(app, 'POST', '/stores/atlas/memories', { content: 'to', kind: 'note' }))
      .body as { id: string };
    const linked = await call(app, 'POST', `/stores/atlas/memories/${from.id}/link`, {
      to: to.id,
      kind: 'references',
      metadata: { why: 'test' },
    });
    assert.equal(linked.status, 201);
    assert.deepEqual(linked.body, { from_id: from.id, to_id: to.id, kind: 'references' });
    const served = await call(app, 'GET', `/stores/atlas/memories/${from.id}`);
    assert.equal(served.body.relations.out[0].kind, 'references');
    const self = await call(app, 'POST', `/stores/atlas/memories/${from.id}/link`, {
      to: from.id,
      kind: 'self',
    });
    assert.equal(self.status, 400);
    assert.match((self.body as { error: string }).error, /self-edge/);
    const unlinked = await call(app, 'DELETE', `/stores/atlas/memories/${from.id}/link`, {
      to: to.id,
    });
    assert.equal(unlinked.status, 204);
    assert.equal(
      (await call(app, 'DELETE', `/stores/atlas/memories/${from.id}/link`, { to: to.id })).status,
      404,
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('merge answers 201 with the fusion id — the facade teaches arity and kind fights', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const one = (
      await call(app, 'POST', '/stores/atlas/memories', { content: 'one', kind: 'note' })
    ).body as { id: string };
    const two = (
      await call(app, 'POST', '/stores/atlas/memories', { content: 'two', kind: 'note' })
    ).body as { id: string };
    const fused = await call(app, 'POST', '/stores/atlas/merge', {
      ids: [one.id, two.id],
      content: 'the fusion',
    });
    assert.equal(fused.status, 201);
    const fusionId = (fused.body as { id: string }).id;
    const served = await call(app, 'GET', `/stores/atlas/memories/${fusionId}`);
    assert.equal(served.body.content, 'the fusion');
    assert.equal(served.body.kind, 'note', 'the sources agree — kind inherits');
    const arity = await call(app, 'POST', '/stores/atlas/merge', { ids: [one.id], content: 'x' });
    assert.equal(arity.status, 400);
    assert.match((arity.body as { error: string }).error, /at least 2/);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a ro grant reads everything and writes nothing — 403 on every write route', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    const created = await call(app, 'POST', '/stores/atlas/memories', {
      content: 'x',
      kind: 'note',
    });
    const id = (created.body as { id: string }).id;
    const attempts: readonly (readonly [string, string, unknown?])[] = [
      ['POST', '/stores/atlas/memories', { content: 'x', kind: 'note' }],
      ['POST', `/stores/atlas/memories/${id}/supersede`, { content: 'y' }],
      ['POST', `/stores/atlas/memories/${id}/deprecate`],
      ['POST', `/stores/atlas/memories/${id}/hot`, { hot: true }],
      ['POST', `/stores/atlas/memories/${id}/link`, { to: id, kind: 'x' }],
      ['DELETE', `/stores/atlas/memories/${id}/link`, { to: id }],
      ['POST', '/stores/atlas/merge', { ids: [id, id], content: 'x' }],
    ];
    for (const [method, path, body] of attempts) {
      const { status, body: responseBody } = await call(app, method, path, body, RO);
      assert.equal(status, 403, `${method} ${path} must refuse a ro grant`);
      assert.match((responseBody as { error: string }).error, /read-only/);
    }
    assert.equal(
      (await call(app, 'GET', '/stores/atlas/memories', undefined, RO)).status,
      200,
      'reads stay open',
    );
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a foreign store refuses writes on reach, before the mode is even asked', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    registry.create('atlas');
    registry.create('other');
    const foreign = await call(
      app,
      'POST',
      '/stores/other/memories',
      { content: 'x', kind: 'note' },
      RW,
    );
    assert.equal(foreign.status, 403);
    assert.match((foreign.body as { error: string }).error, /reaches store "atlas" only/);
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
