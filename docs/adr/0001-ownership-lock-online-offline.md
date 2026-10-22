# One owner per store: the server arbitrates online access, the manager works offline

souvenance v0.2.0 splits authority by who owns the store. A running HTTP **server** owns every store it has open — enforced by an **ownership lock** (one owner per store, PID + heartbeat, with a recover escape hatch). While the server owns a store, every memory operation must flow through it, so auth, token scoping, and request caps have a single enforcement point. When no server runs, the **manager** CLI may open stores directly; its maintenance verbs (`doctor`, `export`, `fork`) always refuse politely while the server owns the store.

## Considered options

- **Dual-mode client** — the client CLI opens SQLite directly when no server runs (v0.1 standalone parity for one-shot use). Rejected with the two-binary split: a pure client keeps the "single enforcement point" promise structural — the client cannot bypass the server; a cold host stores by letting the manager start the server first.
- **WAL read-only coexistence** — offline verbs run read-only beside a running server. Rejected: two write paths held together only by convention; the ownership lock makes the arbitration explicit and turns v0.1's open-race tests into the contract.

## Consequences

- Client commands fail fast with a hint ("server not reachable — run `souvenance server status`"); never a silent fallback to direct access.
- SQLite WAL stays enabled; the lock governs ownership, not SQLite modes.
- The MCP stdio server counts as another would-be owner: it bridges through the HTTP server rather than opening the store directly.
