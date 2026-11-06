/**
 * The clause home's pins: the wire's shared shapes ride the shared
 * clauses (a re-typed text is a drift the judge would serve), and the
 * ceiling clauses interpolate — a literal number in a text lies the day
 * the cap moves, the exact drift the home exists to kill.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { checkinLimitShape, depthShape, limitShape } from '../server/wire/wire.ts';
import { MAX_SUMMARY_LENGTH } from '../store/store.ts';
import { TEACHING } from './teaching.ts';

test("the wire's shared shapes ride the shared clauses", () => {
  assert.equal(limitShape.description, TEACHING.limitExplicit);
  assert.equal(checkinLimitShape.description, TEACHING.limitCheckin);
  assert.equal(depthShape.description, TEACHING.depthProjection);
});

test('the ceiling clauses interpolate the caps — never a literal', () => {
  assert.ok(TEACHING.summary.startsWith('the authored condensation'));
  assert.match(TEACHING.summary, new RegExp(`past the ${MAX_SUMMARY_LENGTH}-character ceiling`));
});
