import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { Skills } from './skills.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'souvenance-skills-test-'));
}

function skillMarkdown(
  name: string,
  description: string,
  body = 'You are the individual of this store.',
): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
}

function writeSkill(dir: string, folder: string, markdown: string, guidance?: string): void {
  const skillDir = join(dir, folder);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), markdown, 'utf8');
  if (guidance !== undefined) writeFileSync(join(skillDir, 'guidance.json'), guidance, 'utf8');
}

const WAKING_GUIDANCE = JSON.stringify({
  guidance: [
    { route: 'checkin', when: 'always', line: 'continue, do not restart', skill: 'waking' },
  ],
});
const SETUP_GUIDANCE = JSON.stringify({
  guidance: [
    {
      route: 'checkin',
      when: 'store-empty',
      line: 'an empty store is an unborn individual',
      skill: 'setup',
    },
  ],
});

test('the shipped surface loads — the start heads the index, the body serves verbatim (#82)', () => {
  const skills = Skills.open();
  assert.deepEqual(
    skills.index().map((entry) => entry.name),
    ['waking', 'setup'],
  );
  const shipped = readFileSync(
    join(import.meta.dirname, '..', '..', '..', '..', 'skills', 'waking', 'SKILL.md'),
    'utf8',
  );
  assert.equal(skills.item('waking'), shipped);
});

test('the shipped guidance resolves — always serves continuity, store-empty overrides (#82)', () => {
  const skills = Skills.open();
  assert.deepEqual(skills.guidanceFor('checkin', { storeEmpty: false }), {
    line: "the hot block is your last session — continue it, don't restart",
    skill: 'waking',
  });
  assert.deepEqual(skills.guidanceFor('checkin', { storeEmpty: true }), {
    line: 'an empty store is an unborn individual — run setup',
    skill: 'setup',
  });
  assert.equal(skills.guidanceFor('checkout', { storeEmpty: false }), undefined);
});

test('the index orders the start first, then alphabetical', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'setup', skillMarkdown('setup', 'First wake.'));
    writeSkill(dir, 'alpha', skillMarkdown('alpha', 'Another practice.'));
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.'));
    const skills = Skills.open(dir);
    assert.deepEqual(
      skills.index().map((entry) => entry.name),
      ['waking', 'alpha', 'setup'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a stray file in the skills directory is skipped — the folders are the skills', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.'));
    writeFileSync(join(dir, 'README.md'), 'not a skill', 'utf8');
    const skills = Skills.open(dir);
    assert.deepEqual(
      skills.index().map((entry) => entry.name),
      ['waking'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a name outside the grammar refuses the boot', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'waking', skillMarkdown('Waking', 'The waking posture.'));
    assert.throws(() => Skills.open(dir), /grammar/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a name disagreeing with its folder refuses — one name, three homes', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'waking', skillMarkdown('setup', 'First wake.'));
    assert.throws(() => Skills.open(dir), /one name, three homes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a frontmatter key beyond name and description refuses — the packaging would (#77)', () => {
  const dir = tempDir();
  try {
    const markdown =
      '---\nname: waking\ndescription: The posture.\nwhen_to_use: always\n---\n\nBody.';
    writeSkill(dir, 'waking', markdown);
    assert.throws(() => Skills.open(dir), /nothing else/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a description past the startup-hint cap refuses', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'waking', skillMarkdown('waking', 'hint '.repeat(256)));
    assert.throws(() => Skills.open(dir), /startup-hint/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a folder without a SKILL.md refuses — half an orientation is a lie', () => {
  const dir = tempDir();
  try {
    mkdirSync(join(dir, 'waking'), { recursive: true });
    assert.throws(() => Skills.open(dir), /no SKILL\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a body past the disclosure cap refuses', () => {
  const dir = tempDir();
  try {
    const body = Array.from({ length: 502 }, (_, line) => `line ${line}`).join('\n');
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.', body));
    assert.throws(() => Skills.open(dir), /500 lines/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a guidance.json that is not JSON refuses', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.'), '{nope');
    assert.throws(() => Skills.open(dir), /not JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a guidance route outside the served set refuses', () => {
  const dir = tempDir();
  try {
    const guidance = JSON.stringify({
      guidance: [{ route: 'merge', when: 'always', line: 'merge wisely', skill: 'waking' }],
    });
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.'), guidance);
    assert.throws(() => Skills.open(dir), /served set/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a guidance condition the wire does not know refuses', () => {
  const dir = tempDir();
  try {
    const guidance = JSON.stringify({
      guidance: [{ route: 'checkin', when: 'sometimes', line: 'maybe', skill: 'waking' }],
    });
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.'), guidance);
    assert.throws(() => Skills.open(dir), /conditions the wire knows/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a repeated route-and-condition refuses — one line per route per condition', () => {
  const dir = tempDir();
  try {
    const second = JSON.stringify({
      guidance: [{ route: 'checkin', when: 'always', line: 'another line', skill: 'setup' }],
    });
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.'), WAKING_GUIDANCE);
    writeSkill(dir, 'setup', skillMarkdown('setup', 'First wake.'), second);
    assert.throws(() => Skills.open(dir), /one line per route/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guidance pointing at no loaded skill refuses — the voice never dangles', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'waking', skillMarkdown('waking', 'The waking posture.'), SETUP_GUIDANCE);
    assert.throws(() => Skills.open(dir), /never dangles/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing start skill refuses — a pointer to nothing is a mute door', () => {
  const dir = tempDir();
  try {
    writeSkill(dir, 'setup', skillMarkdown('setup', 'First wake.'));
    assert.throws(() => Skills.open(dir), /start skill "waking" is missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
