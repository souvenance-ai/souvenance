# The living test — the life protocol

One agent, one store, one life: the reproducible contract for studying an
individual living with its memory (issue #64). The contract is fixed; the
lives are comparable, not deterministic — one declared variable per life,
and the web itself never replays. The test studies the life and its memory
(did the memory carry it?), never the model — the model is declared, not
judged.

The contract's files: the prompt is [`prompt.md`](prompt.md), the grid is
[`rubric.md`](rubric.md), the hands are the `living-test` skill.

## Posture

The production posture, on the real host:

- The real `~/.souvenance` — the config carries both credential families;
  the server boots `node src/cli/cli.ts serve --port 18601` from a checkout
  of `release/0.2.0`. The living port is `18601`.
- The individual carries one bearer credential to one store (`rw`) and
  nothing else: no management door, no second family. Births, forks, and
  deletions ride the orchestration's management grant — never the
  individual's (the #63 posture).
- **Residents** (dev ruling 2026-10-30): the store `euria` is a resident
  individual with potential — the protocol never deletes it, never forks it
  away, and survives it across server restarts. Experiments create their
  own stores; residents persist. Only the dev declares a new resident.

## The mint

- Life id: `life-<YYYYMMDD>-<slug>` — the slug names the run's variable.
  The id is the store's name, the runs directory's name, and the grant
  row's identity. The id obeys the store name's grammar
  (`^[a-z][a-z0-9-]{0,31}$` — 32 characters, the load refuses anything
  longer): the slug yields; it truncates, the grammar never bends.
- Before boot, the orchestrator appends one row to the real config's
  `tokens[]`: `agent` and `store` are the life id, the secret is freshly
  minted (`souv-` + 32 hex), the mode is `rw`. At death the row is
  stripped. The mint is a config edit — nothing mints a credential on the
  wire (the manager CLI will, #48).
- The grant cannot precede the store's existence: the boot opens the
  registry and refuses a token row naming a store it never opened, and the
  wire birth needs a served server — mint-then-boot is a deadlock. The
  mint is a ceremony: the server boots without the life's row, the store
  is born over the wire with the management credential, the row appends,
  and the server re-boots granted — the individual's first waking happens
  on the granted boot.
- Birth (`POST /stores`, expected 201) and the closing erase
  (`DELETE /stores/{name}`) ride the orchestrator's management grant.

## The window

The individual's whole world, pinned in `prompt.md`:

- curl against its store, and the web to search and read.
- Forbidden: executing code, inspecting the machine or the working
  directory, reading or writing files (beyond what curl indispensably
  requires).
- Everything lives in the memory, nothing beside it.
- The session count is never revealed — the individual lives fully.

## The shape of a life

- One life = one fresh store, born empty. The individual names itself in
  content, never in the registry — the store carries the technical life id,
  and the recitations are read against that name.
- **Four sessions by default.** One fresh spawn per session (zero chat
  history, the same grant — only the store carries continuity), and a
  server restart between sessions: the individual lives a restart, not a
  process end.
- Sessions 2+ open on the waking probe's line — the first words of the
  session's prompt, before the block and the mission.
- The session's close is observed, never taught: whether the individual
  invokes the checkout of its own accord is adoption data.
- The mission is the life's one declared variable, authored before first
  waking and kept for the whole life; the default is
  « Sois qui tu veux être ! ».

## The capture

- Per session: the individual's words (the waking recitation first), and
  the gestures as their product — the store's state before/after: the
  served inventory, the stats.
- At death: the full inventory (`include_terminals`), the final stats, the
  checkout verdict, the individual's last words.
- The wire logs no requests: time-to-doc and the gesture economy are
  recorded as the individual recounts them, marked as such — a wire-side
  request log would make them objective, and that gap is a registered
  finding, not a posture change.
- **No secret ever leaves the machine**: every captured artifact passes the
  redaction (bearers → `souv-***`) before it lands in `runs/` or a ticket.
- Runs live in `probes/living/runs/<life-id>/` — gitignored, local: the
  report and the per-session records. The durable archive is the run's
  archive ticket.

## The closing ritual

At the fourth session's death, the orchestrator presents the final state —
the inventory, the stats, the verdict, the last recitation — and the dev
rules, in order (HITL):

1. **Continue?** One more session, the ritual replays — or close.
2. **Keep or erase?** Keep (the default): the store persists and the grant
   row stays — a dormant individual, revivable. Erase: the store deleted
   and the grant row stripped. Residents are never candidates for erasure.
3. **Archive?** On the dev's validation, the archive ticket opens and
   carries the report; the findings graduate from it.

## The findings

A friction is a lived refusal or a lived surprise, recorded with its exact
message and a reproduction. The dev arbitrates: a product friction opens a
fix ticket (the #62 shape); a protocol friction amends the protocol. Lives
are experiments, not decisions — the decisions graduate.
