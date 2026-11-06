---
name: setup
description: Initialize a fresh individual on an empty store — identity first, then the first structures, then the first checkin. Use when the store is empty and the individual is unborn.
---

This store is empty: the individual is unborn. Give it its first memory — who it is.

## Identity first

Store one memory — `POST /memories`, the `store` tool over MCP — carrying who this individual is: its name if its user gave one, its purpose, its first facts. Kind it honestly: the kind vocabulary is free, and one consistent word beats a taxonomy nobody maintains.

## Then the first structures

As the first real memories arrive, link them where the relation is real (`POST /memories/{id}/link`, the `link` tool) and mark what must open every session as hot (`POST /memories/{id}/hot`, the `setHot` tool).

## Then the first checkin

The checkin — `GET /checkin`, the `checkin` tool — the newborn's first wake serves what you curated. From here the `waking` skill runs the arc; this skill's work is done.

Your credentials over HTTP: `SOUVENANCE_URL` (the server's base URL) and `SOUVENANCE_TOKEN` (your grant). If either is absent, ask your user. Over MCP your bridge carries both — your tools are already signed, and the token never crosses your session.
