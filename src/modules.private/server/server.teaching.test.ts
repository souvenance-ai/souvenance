/**
 * The sufficiency bar, pinned mechanically (#93): the served document
 * carries its Teaching — the info description, every operation's summary
 * + description, every response's description, every parameter's
 * description, every component's description — and it stays
 * engine-agnostic: no storage term, no issue or Q-ref, in any string the
 * wire serves. A route landing bare fails this suite.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { createApp } from './server.ts';
import { Registry } from './registry/registry.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-teaching-test-'));
}

function boot(dir: string) {
  const registry = Registry.open(dir);
  const app = createApp({ registry, tokens: [], management: [], version: 'test' });
  return { app, registry };
}

interface ParameterObject {
  readonly description?: string;
}

interface ResponseObject {
  readonly description?: string;
}

interface OperationObject {
  readonly summary?: string;
  readonly description?: string;
  readonly parameters?: readonly ParameterObject[];
  readonly responses?: Readonly<Record<string, ResponseObject>>;
}

interface SchemaObject {
  readonly description?: string;
}

interface OpenAPIDocument {
  readonly info: { readonly description?: string };
  readonly paths: Readonly<Record<string, Readonly<Record<string, OperationObject>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, SchemaObject>> };
}

const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

test('the sufficiency bar — the served document teaches every gesture, response, parameter and shape', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const doc = (await (await app.request('/doc')).json()) as OpenAPIDocument;
    assert.ok(doc.info.description, 'info.description teaches');
    let operations = 0;
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!METHODS.has(method)) continue;
        operations += 1;
        const where = `${method.toUpperCase()} ${path}`;
        assert.ok(operation.summary, `${where} carries a summary`);
        assert.ok(operation.description, `${where} carries a description`);
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          assert.ok(response.description, `${where} ${status} carries a description`);
        }
        for (const parameter of operation.parameters ?? []) {
          assert.ok(parameter.description, `a parameter of ${where} is described`);
        }
      }
    }
    // The served surface is 19 operations — the probes' doc-wire phase
    // pins the same count: a bare or silently dropped route fails here.
    assert.equal(operations, 19);
    const schemas = doc.components?.schemas ?? {};
    for (const [name, schema] of Object.entries(schemas)) {
      assert.ok(schema.description, `the component ${name} carries a description`);
    }
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function collectStrings(node: unknown, found: string[]): void {
  if (typeof node === 'string') {
    found.push(node);
  } else if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, found);
  } else if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectStrings(value, found);
    }
  }
}

test('the Teaching is engine-agnostic — no storage term, no issue ref, in any served string', async () => {
  const dir = tempDir();
  try {
    const { app, registry } = boot(dir);
    const doc = await (await app.request('/doc')).json();
    const strings: string[] = [];
    collectStrings(doc, strings);
    assert.ok(strings.length > 100, 'the document serves its texts');
    for (const text of strings) {
      assert.doesNotMatch(
        text,
        /\bbm25\b|\bsqlite\b|\bwal\b|\bdb\b|\.db\b|#\d+|\bQ\d+\b|\bfts5\b/i,
        `leakage: "${text}"`,
      );
    }
    registry.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
