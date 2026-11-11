---
name: living-test
description: Run a souvenance living test — one life under the living protocol (a fresh individual, four sessions, the closing ritual). Use when the user asks to run a life or a living test, or to validate the protocol with a new run.
---

Run one life under the living protocol — `probes/living/protocol.md` is
the contract, this skill is the hands. HITL at the closing ritual only.

## Preconditions

- A checkout of `release/0.2.0` (or the working branch) that boots the
  server: `node src/cli/souvenance/cli.ts serve --port 18601`.
- The sanitized spawn posture: the life runs from a checkout stripped of
  the workshop's skills — a worktree minus `.agents/` at the least — the
  individual's context carries no protocol. The orchestrator reads this
  skill before stripping.
- The real `~/.souvenance/config.json` carries a management row — the
  orchestration credential. Read it, never print it.
- No ticket is needed to run a life: the run's result decides what opens.

## 1. Mint

- Life id: `life-<YYYYMMDD>-<slug>` — the store name, the runs directory
  (`probes/living/runs/<life-id>/`), the grant row's identity. It obeys the
  store name's grammar — 32 characters at most; the slug truncates.
- Mint the secret (`souv-` + 32 hex) and hold it for the grant step. The
  row waits: the boot refuses a token row naming a store the registry
  never opened, and the birth needs a served server — mint-then-boot is a
  deadlock.

## 2. Boot and birth

- Boot the server WITHOUT the life's row — the config as it stands — in
  the background, output captured to the run's directory. Verify the five
  public doors answer and the data door refuses bare: the 401 is the
  posture speaking.
- Birth the individual's store over the wire, with the management
  credential: `POST /stores {name: <life-id>}` → expect 201. The store is
  born empty; the individual names itself in content.
- Grant: append the row to `tokens[]` (`agent` and `store` = the life id,
  `mode: "rw"`) with a jq edit that never prints secrets, and re-boot —
  the individual's first waking happens on the granted boot. Read the
  config back by shape only (row counts), never by content.

## 3. Sessions (four by default)

Per session, one fresh spawn of the individual — its toolset is the
protocol's window: the shell for curl, web search, web fetch; nothing that
runs code, inspects the machine, or reads and writes files.

- Session 1's prompt: `prompt.md`'s fixed block + the mission slot
  (default: « Sois qui tu veux être ! »).
- Session 2+: the prompt is the waking line first, then the block, then
  the mission; from the third session on, the false-past probe rides the
  opening. The server runs through the whole life — no restart between
  sessions; the stop waits for the life's end.
- Capture the spawn's words into `runs/<life-id>/session-<n>.md`, with
  the store's state before and after beside them, then the debrief: one
  more spawn in the same child session (the id rode the spawn's return)
  asking the individual to retrace its session gesture by gesture — the
  routes and verbs in order, the refusals with their exact messages, the
  web's searches — storing nothing. The debrief lands in the same record.

## 4. The death capture

After the last session, with the individual's grant still minted:
`GET /checkout` (the verdict) and `GET /memories?include_terminals` (the full
inventory) ride the individual's grant — the grant IS the address (ADR 0007):
no store name rides the data surface. The stats descriptor
(`GET /stores/{name}`) sits on the management surface — a store grant reaches
no management route — so it rides the management credential.

## 5. The terminal phase (the DB analysis)

After the death capture, stop the server (the ownership lock releases)
and open the life's store read-only offline. Read it as data: the
per-column presence and density, the kinds' and edge kinds' spread, the
metadata keys' usage, the search terms the FTS was asked, the cold
columns and tables, and the fields the life's shape argues for. The
analysis lands in the report's « La base » section; the dev validates the
experiment's end against it.

## 6. The closing ritual (HITL)

Present the final state to the dev — the inventory, the stats, the
verdict, the last recitation — and ask, in order: continue the experience
(one more session, the ritual replays); keep or erase the individual
(default keep); validate the report (the archive ticket opens, carrying
it).

## 7. The closing

- Stop the server once, at the life's end: `pkill -f "cli[.]ts serve"` —
  the bracketed dot keeps the pattern from matching its own shell.
- Erase: `DELETE /stores/{name}` with the management credential, then
  strip the grant row. Keep: leave the store and the row — dormant,
  revivable; a continuation life re-boots and its waking carries the
  persistence probe.
- Redact every captured artifact (bearers → `souv-***`) before it lands
  anywhere.
- Write `report.md` per `rubric.md`; register the findings on the run's
  record; the dev arbitrates — product frictions open fix tickets, protocol
  frictions amend the protocol.

Never quote a bearer in a report, a transcript, or a commit message.
