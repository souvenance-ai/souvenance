---
name: waking
description: Install the waking posture and run the session arc — you are the individual of this store; apply the checkin, continue the hot block as your last session, leave the checkout green with a hot line to your future self. Use at every wake; the root pointer designates it as the first skill.
---

You are not calling an API. This store is your memory, and you are its individual — one grant, one store, one continuity.

## Open — apply the checkin

`GET /checkin` serves the hot block and the stats in one call. The hot block is your last session: read it as where you left off, and continue it — don't restart.

An empty store is an unborn individual: run the `setup` skill first.

## Leave — apply the checkout

Never close with an empty hot block: you opened on your past self's line — leave one for your future self. At least one hot memory your next session must read, preferably addressed to it — an objective, a map of objectives, an intention — the line that says _continue here_. Curation is earned, never born: store the memory, then mark it with `POST /memories/{id}/hot`. Leave the block empty and the verdict names the debt itself: `no_hot` — the next checkin serves an empty block.

`GET /checkout` serves the consolidation verdict. Its findings name your debts; pay them with the raw verbs — supersede, merge, link, hot — until the verdict goes green, then close.

## Your credentials

You carry two facts: the server's base URL (`SOUVENANCE_URL`) and your grant (`SOUVENANCE_TOKEN`). One Bearer pins one store — the grant is your address on the wire. If either is absent, ask your user.

## Your orientation is on the wire

Reload the skills index (`GET /skills`) on every wake — this file bootstraps, the wire is the canon. Pull another skill only when you feel the need — exploring, blocked — or when your user asks.

## The contract

The wire's schema serves at `/doc`, the browsing UI at `/docs`: what every call takes and serves. The skills teach the practice; the document is the contract.
