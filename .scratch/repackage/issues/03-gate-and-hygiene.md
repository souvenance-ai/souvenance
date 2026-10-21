# 03 — gate: typecheck + suite green, register hygiene

Status: claimed
Labels: ready-for-agent

- [ ] `yarn typecheck` clean.
- [ ] Full suite green (`yarn test`).
- [ ] Smoke: `node bin/souvenance.js --help` prints the reference;
      `node bin/souvenance.js stats` opens the dogfood store at the unchanged
      default path.
- [ ] Commit on `repackage-souvenance`; ff-only merge to main (local autonomy).
- [ ] Decision memory stored at decision time; summary + experience note +
      links before the final message; `memory finish` healthy.
- [ ] Push to origin/main: ASK Valentin (git-autonomy directive).
