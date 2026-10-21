# 03 — VPS systemd unit migration (memory.souvenance.org mirror)

Status: ready-for-human
Type: task

The VPS runs a token-gated mirror (`memory.souvenance.org`, Valentin personal).
Its systemd unit opens a store whose path references the dead name. In-arc
migration WITH rollback, per decision `de52efb9`.

## Exact commands (Valentin executes; adjust paths to the unit's ExecStart)

1. Read the current unit to locate the `--db` path inside ExecStart:
   `systemctl cat souvenance.service` (unit name per the VPS layout).
2. Stop the service:
   `sudo systemctl stop souvenance`
3. Move the store file (and sidecars if the service ran recently):
   `sudo mv /etc/souvenance/memory.db /etc/souvenance/memory.db.new-path`
   — ACTUAL MOVE IS: keep the store UNDER its new directory, e.g.
   `sudo mkdir -p /etc/souvenance && sudo mv <old-dir>/memory.db /etc/souvenance/memory.db`
   plus `mv <old-dir>/memory.db-wal ... -shm ...` when present.
4. Edit the unit's ExecStart `--db` argument to the new path:
   `sudo systemctl edit souvenance` (drop-in) or edit the unit file directly,
   then `sudo systemctl daemon-reload`.
5. Start + verify:
   `sudo systemctl start souvenance && systemctl status souvenance`
   then a token request against `https://memory.souvenance.org` must answer
   as before (same memories, same token — the store file moved, nothing else).

## Rollback

Reverse: stop, `mv` the file(s) back, restore the unit's `--db` (git-tracked
unit file or remove the drop-in), `daemon-reload`, start.

## Never

- memory.souvenance.org stays UNLINKED from all public materials (wake
  condition in the arc objective). Renaming the path does not change that.

## Resolution

(Valentin executes when he takes the phase-3 push)
