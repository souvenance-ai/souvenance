/**
 * The battery's dispatcher: `node probes/run/run.ts [A|B|C|D]`.
 * No flag = all four phases, one fresh work root, sequential (each phase
 * boots its own throwaway servers on its own port). Exit 0 only when
 * every probe case passed — the regression gate an agent or the dev runs
 * after any server change.
 *
 * Hygiene first: an aborted earlier run leaves orphaned serve processes
 * on the battery's ports and the fresh boots read healthz 200 served by a
 * foreign host. The sweep kills every listener on the battery's port rack
 * before the phases roll (the rack: each phase's base and its的歌 kin).
 */
import { execSync } from 'node:child_process';
import type { Battery } from '../battery/battery.ts';

const valid = ['A', 'B', 'C', 'D'];
const ports = [18501, 18502, 18531, 18532, 18541, 18542, 18543];

const selected = process.argv[2]?.toUpperCase();
if (selected !== undefined && !valid.includes(selected)) {
  console.error(`usage: node probes/run/run.ts [${valid.join('|')}] — got '${process.argv[2]}'`);
  process.exit(1);
}

for (const port of ports) {
  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
  } catch {
    /* port already free */
  }
}

const { mkdtemp } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const root = await mkdtemp(join(tmpdir(), 'souvenance-probes-'));

const modules = [
  '../doc-wire/doc-wire.ts',
  '../adversarial/adversarial.ts',
  '../auth-matrix/auth-matrix.ts',
  '../concurrency/concurrency.ts',
].map((relative) =>
  import(relative).then((module) => module as { battery: (root: string) => Battery }),
);

const { runBattery } = await import('../battery/battery.ts');

const wanted = selected === undefined ? valid : [selected];
let failures = 0;
try {
  for (const phase of wanted) {
    const module = await modules[valid.indexOf(phase)];
    failures += await runBattery(module.battery(root));
  }
} finally {
  for (const port of ports) {
    try {
      execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
    } catch {
      /* port already free */
    }
  }
}
if (failures > 0) process.exit(1);
