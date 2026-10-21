import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Regression for the fresh-store open race (2026-10-15 diagnosis, .scratch/concurrent-write-races):
// execPragma used to run PRAGMA journal_mode = WAL BEFORE busy_timeout, so simultaneous CLI
// opens on a FRESH store raced on the WAL file-header grab with no busy handler. Losers died
// with 'could not open store: database is locked'. Order flipped; this test locks it.
test("open: simultaneous CLI opens on a fresh store all succeed (busy_timeout first)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-race-"));
  const dbPath = join(dir, "memory.db");
  const N = 4;
  const gate = Date.now() + 400;
  const child = `
    let dbPath=process.argv[1]; let gate=parseInt(process.argv[2],10); const tag=process.argv[3];
    const fire=()=>{ const {execFileSync}=require('child_process');
      try {
        const out=execFileSync(process.execPath,['bin/souvenance.js','--db',dbPath,'store','race '+tag]);
        process.stdout.write(String(out).trim());
      } catch (e) {
        process.stdout.write('FAILED '+(e.stderr||'').toString());
      }
    };
    setTimeout(fire, Math.max(0, gate-Date.now()));
  `;
  try {
    const outs = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        new Promise<string>((resolve) => {
          const p = spawnSync(process.execPath, ["-e", child, dbPath, String(gate), String(i)], { cwd: process.cwd() });
          resolve(p.stdout.toString().trim());
        }),
      ),
    );
    for (const out of outs) {
      assert.ok(!out.startsWith("FAILED"), `an open lost the fresh-store race: ${out}`);
    }
    const ids = outs.filter((o) => o.length > 0);
    assert.equal(ids.length, N, `expected all ${N} ids, got ${ids.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
