# The adversarial wire battery

The agent's black-box rig over the HTTP surface (issue #51's artifact):

- **`/doc` is the canon** — the probes ask the wire what it does and fold every observed exchange against the served OpenAPI document (`docAgrees`). The implementation is never read.
- **Honest isolation** — each battery boots a real `souvenance serve` on its own throwaway `HOME` (fresh config, fresh stores) on its own port; nothing reaches outside the host.
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

| root | port    | what it pins                                                                 |
| ---- | ------- | ---------------------------------------------------------------------------- |
| A `doc-wire`    | 18501 | happy paths of all 17 routes folded on the served `/doc`, keyset paging peek truth, `(created_at,id) DESC` order, fork carry |
| B `adversarial` | 18502 | malformed JSON, wrong types, hostile metadata keys and **values** (ruling A #51: trees serve, arrays/null/non-finite refuse), oversized 413, corrupt cursors, limits, depth, path traversal, unicode round-trips, removed surfaces, dup JSON keys |
| C `auth-matrix` | 18531 | operator loopback, ro on every write, the manage cap, bad bearers, the off-loopback bind refusal, the 429 window with its real reset |
| D `concurrency` | 18541 | 24 parallel writers, the SIGKILL patient lock (~30 s refusal → takeover + WAL durability), the second-host refusal, create/fork/delete races, parallel supersede, SIGTERM handover |

## Hygiene

One honest retry rides `req()` for the keep-alive pool race (a client pool reusing a
socket the server closed right after a 413 mid-body abort surfaces as `UND_ERR_SOCKET`)
— visible as `[retry …]` lines; a repeated failure still fails its case.
