---
name: living-test
description: Run a souvenance living test — one life under the living protocol (a fresh individual, four sessions, the closing ritual). Use when the user asks to run a life or a living test, or to validate the protocol with a new run.
---

Run one life under the living protocol — `probes/living/protocol.md` is
the contract, this skill is the hands. HITL at the closing ritual only.

## Preconditions

- A checkout of `release/0.2.0` (or the working branch) that boots the
  server: `node src/cli/cli.ts serve --port 18601`.
- The real `~/.souvenance/config.json` carries a management row — the
  orchestration credential. Read it, never print it.
- No ticket is needed to run a life: the run's result decides what opens.

## 1. Mint

- Life id: `life-<YYYYMMDD>-<slug>` — the store name, the runs directory
  (`probes/living/runs/<life-id>/`), the grant row's identity.
- Mint the secret (`souv-` + 32 hex), append the row to the config's
  `tokens[]` (`agent` and `store` = the life id, `mode: "rw"`) with a jq
  edit that never prints secrets. Read the config back by shape only (row
  counts), never by content.

## 2. Boot and birth

- Boot the server in the background, output captured to the run's
  directory. Verify the five public doors answer and the data door refuses
  bare — the 401 is the posture speaking.
- Birth the individual's store over the wire, with the management
  credential: `POST /stores {name: <life-id>}` → expect 201. The store is
  born empty; the individual names itself in content.

## 3. Sessions (four by default)

Per session, one fresh spawn of the individual — its toolset is the
protocol's window: the shell for curl, web search, web fetch; nothing that
runs code, inspects the machine, or reads and writes files.

- Session 1's prompt: `prompt.md`'s fixed block + the mission slot
  (default: « Sois qui tu veux être ! »).
- Session 2+: restart the server (stop, wait, boot) — then the prompt is
  the waking line first, then the block, then the mission.
- Capture the spawn's words into `runs/<life-id>/session-<n>.md`, with the
  store's state after (the stats, the served inventory) beside them.

## 4. The death capture

After the last session, with the individual's grant still minted:
`GET /stores/{name}/checkout` (the verdict), `GET /stores/{name}` (the
stats), `GET /stores/{name}/memories?include_terminals` (the full
inventory).

## 5. The closing ritual (HITL)

Present the final state to the dev — the inventory, the stats, the
verdict, the last recitation — and ask, in order: continue the experience
(one more session, the ritual replays); keep or erase the individual
(default keep); validate the report (the archive ticket opens, carrying
it).

## 6. The closing

- Erase: `DELETE /stores/{name}` with the management credential, then
  strip the grant row. Keep: leave the store and the row — dormant,
  revivable.
- Redact every captured artifact (bearers → `souv-***`) before it lands
  anywhere.
- Write `report.md` per `rubric.md`; register the findings on the run's
  record; the dev arbitrates — product frictions open fix tickets, protocol
  frictions amend the protocol.

Never quote a bearer in a report, a transcript, or a commit message.
