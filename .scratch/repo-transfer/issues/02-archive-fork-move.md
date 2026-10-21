# 02 — archive fork move (Valentin's backup software)

Status: resolved (agent-side done; Valentin-side acts: backup-software paths, his hands)
Type: task

`archive.db` is the archive fork produced/maintained by Valentin's personal
backup software — decision `de52efb9` names it in the blast radius, "his side,
coordinate before touching". TICKET-01 CORRECTION: the fork lives in THIS repo
directory (`.souvenance/archive.db`, 816K, 0644) — it already moved with the
`mv .ai-memory .souvenance`; what remains is coordination, not relocation.

## Steps (Valentin)

1. Confirm the archive fork's role: where his backup job reads/writes it and
   WHEN it next runs (coordinate before that run).
2. Update the paths his backup software / restore scripts reference:
   `.ai-memory/archive.db` → `.souvenance/archive.db`.
3. Optional tightening: opening the fork with souvenance tightens it to 0600
   (e.g. `souvenance --db .souvenance/archive.db stats`) — only after his
   backup job is confirmed path-updated; permission matters if anything
   non-root reads it.

## Never

- `souvenance fork` cannot restore, re-sync, or cross-write into the archive
  (ADR 0002: forks never sync) — moving the file is rebirth-safe: the fork
  neither knows nor cares where it lives; only the forker's scripts do.

## Resolution

COORDINATED (2026-10-21): bundled ask answered "Je gère mon côté" — Valentin
updates the paths in his own backup software; archive.db stays 0644 until he
does (opening it with souvenance later would tighten it to 0600). The file
itself already sits at `.souvenance/archive.db` (moved with ticket 01's mv).
No agent action pending.
