/**
 * The skills door's pins, against the real wire: the index verbatim
 * (the start skill first), the body byte-equal to the served file, the
 * 404's teaching verbatim, and the dot segment judged locally — no
 * call made (the refusal text is the proof: a call would have taught
 * the wire's unreachable or its 404 instead).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { bootTestWire } from '../../../../modules.private/cli/test-wire/test-wire.ts';
import { skills } from './skills.ts';

test('the index rides verbatim — one JSON document, the start skill first', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await skills(wire.store, {});
    assert.equal(answer.exitCode, 0);
    const index = answer.document as {
      version: string;
      skills: { readonly name: string; readonly description: string }[];
    };
    assert.equal(index.version, 'test');
    assert.equal(index.skills[0]?.name, 'waking');
    assert.ok(index.skills.length > 1, 'the shipped skills ride');
    for (const entry of index.skills) {
      assert.match(entry.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.ok(entry.description.length > 0);
    }
  } finally {
    await wire.close();
  }
});

test('the skill\u2019s body rides verbatim — byte-equal to the served file, exit 0', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await skills(wire.store, { name: 'waking' });
    assert.equal(answer.exitCode, 0);
    assert.ok('text' in answer, 'the body is the door\u2019s text shape');
    assert.equal(answer.text, readFileSync(join('skills', 'waking', 'SKILL.md'), 'utf8'));
  } finally {
    await wire.close();
  }
});

test('an unknown name refuses — the wire\u2019s teaching verbatim, exit 1', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await skills(wire.store, { name: 'nope' });
    assert.equal(answer.exitCode, 1);
    assert.match(
      String((answer.document as { error: string }).error),
      /no such skill — the index serves at \/skills/,
    );
  } finally {
    await wire.close();
  }
});

test('a foreign name rides to the wire — encoded, the 404 teaches', async () => {
  const wire = await bootTestWire();
  try {
    const answer = await skills(wire.store, { name: 'no such' });
    assert.equal(answer.exitCode, 1);
    assert.match(String((answer.document as { error: string }).error), /no such skill/);
  } finally {
    await wire.close();
  }
});

test('a dot segment is not a name — the local verdict, no call made', async () => {
  const answer = await skills({ url: 'http://127.0.0.1:1', token: 'souv-x' }, { name: '..' });
  assert.equal(answer.exitCode, 1);
  assert.match(
    String((answer.document as { error: string }).error),
    /a dot segment is not a skill name/,
  );
});
