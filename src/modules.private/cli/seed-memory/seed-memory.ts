/**
 * The action tests' one seed: a memory born through the wire, with the
 * loud refusal when the seed itself breaks — the subject stays the
 * action under test. The tests' boot ceremony is `test-wire`'s; this is
 * its memory row.
 */
import assert from 'node:assert/strict';
import { httpCall } from '../http-call/http-call.ts';
import type { TestWire } from '../test-wire/test-wire.ts';

export async function seedMemory(wire: TestWire, body: Record<string, unknown>): Promise<string> {
  const answer = await httpCall(wire.store, { method: 'post', path: '/memories', body });
  assert.equal(answer.status, 201, `the seed refused: ${JSON.stringify(answer.document)}`);
  return (answer.document as { id: string }).id;
}
