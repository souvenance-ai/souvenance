# The adversarial wire battery

The agent's black-box rig over the HTTP surface (issue #51's artifact):

- **`/doc` is the canon** — the probes ask the wire what it does and fold every observed exchange against the served OpenAPI document (`docAgrees`). The implementation is never read.
- **Honest isolation** — each battery boots a real `souvenance serve` on its own throwaway `HOME` (fresh config, fresh stores) on its own port; nothing reaches outside the host. The production posture (#63): the phases carry their credentials in the config they author — a management token for the store births, a store grant per probed store; the identity cases (bare → 401) call bare on purpose.
- **Agent economics** — the battery intentionally stands out of `fb:test`/CI (the 429 window waits real seconds; the lifecycle phases kill and reboot the server) and out of the tsconfig include (the same exemption `legacy/` rides). A local type pass: `npx tsc --noEmit --strict --target esnext --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --types node probes/run/run.ts`

## Run

```sh
node probes/run/run.ts       # all four phases (~3 min: the 429 window is honest)
node probes/run/run.ts A     # one phase: A doc-vs-wire · B adversarial · C auth-matrix · D concurrency
```

Each phase prints `[PASS]/[FAIL(severity)]` per case and its summary; the phase's report
lands as a JSON file under the run's throwaway work dir (printed path survives inside
`os.tmpdir()/souvenance-probes-*/<phase>/logs/report.json`).

## Phases

| root            | port  | what it pins                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `doc-wire`    | 18501 | happy paths of all 22 routes folded on the served `/doc`, keyset paging peek truth, `(created_at,id) DESC` order, fork carry (the stats' verdict)                                                                                                                                                                                                        |
| B `adversarial` | 18502 | malformed JSON, wrong types, hostile metadata keys and **values** (ruling A #51: trees serve, arrays/null/non-finite refuse), oversized 413, corrupt cursors, limits, depth, path traversal, unicode round-trips, removed surfaces, dup JSON keys                                                                                                        |
| C `auth-matrix` | 18531 | the loopback bypass dead (bare → 401), ro/rw on every write, the management family serving create/list/describe/fork/delete and the wrong-family 403s, bad bearers, the zero-credential boot refusal, the management-only boot birthing a fresh host's first store, the 429 window with its real reset                                                   |
| D `concurrency` | 18541 | 24 parallel writers, the SIGKILL patient lock (~30 s refusal → takeover + WAL durability), the second-host refusal, create/fork/delete races, parallel supersede, SIGTERM handover                                                                                                                                                                       |
| E `grants`      | 18551 | the wire's grant trio on the management surface: bare 401 / store-family 403, mint row + secret exactly once at 0600, a duplicate pair 409, fork → mint → consume at zero host-side gesture, revoke immediate + rotation, the drift refusal on hand-edited rows (restart-to-apply holds), the rows riding a fresh boot, delete sweeping the store's rows |

## Hygiene

One honest retry rides `req()` for the keep-alive pool race (a client pool reusing a
socket the server closed right after a 413 mid-body abort surfaces as `UND_ERR_SOCKET`)
— visible as `[retry …]` lines; a repeated failure still fails its case.

---

## The living test

One agent, one store, one life: an individual is born empty, lives four
sessions (a restart between each, the waking line to open), and is judged on
what its memory carried — the recitations against the served inventory, the
frictions lived on the wire. The contract: [`living/protocol.md`](living/protocol.md);
the prompt: [`living/prompt.md`](living/prompt.md); the grid:
[`living/rubric.md`](living/rubric.md). Runs land in `living/runs/`
(gitignored); the `living-test` skill drives a life and its closing ritual
(issue #64).
