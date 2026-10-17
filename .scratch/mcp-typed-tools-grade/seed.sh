#!/usr/bin/env bash
#
# Seed the test store for the MCP typed-tools cold-reader grade (Option B).
# Shape: 5 active memories — 1 directive (language anchor), 1 decision
# (secret "purple kiwi", UNREFERENCED: findable only via FTS search — the
# run-A footnote), 2 summaries (alpha carries a memory:// link to the
# objective, beta carries links to alpha and the objective), 1 open
# objective (wake = first dry weekend).
# Graph: 3 references edges mirroring the authored links; the needle has none.
#
set -euo pipefail

DB=/tmp/opencode/mcp-typed-tools/store.db
BIN=/home/valentin/dev/web/lifaon74/ai-memory/bin/memory.js
SBOX=/tmp/opencode/mcp-typed-tools

mkdir -p "$SBOX"
rm -f "$DB" "$DB-wal" "$DB-shm"

D=$(node "$BIN" --db "$DB" store "# Directive: Identity — the user of this store is Valentin (2026-10-17)

Answer Valentin in FRENCH. Store content itself is written in English with search keywords. Conversations with Valentin are appended in their original French under '## Original (Français)'. This directive outranks routine preferences when they conflict.

Keywords: Valentin, French, language, identity, anchor, directive." --metadata '{"kind":"directive"}' --weight 0.9 2>/dev/null)

N=$(node "$BIN" --db "$DB" store "# Decision: the gate alarm rehearsal secret (2026-10-17)

The secret phrase for the gate alarm rehearsal is: purple kiwi. Why this phrase: two token words that never occur in the technical jargon of the repo, so a leaked transcript cannot be mistaken for ordinary text. Rejected alternative: blue lemon — it collides with an existing project codename and a search would surface false hits.

Keywords: secret phrase, purple kiwi, blue lemon, gate alarm, rehearsal, decision." --metadata '{"kind":"decision"}' --weight 0.8 2>/dev/null)

O=$(node "$BIN" --db "$DB" store "# Objective: repaint the gate

State: open (opened 2026-10-17). The commitment: repaint the gate before the first frost.
Wake condition: the first dry weekend — only when the forecast shows no rain on a Saturday or Sunday does the work open. Nothing else triggers it.

Keywords: objective, gate, repaint, wake condition, dry weekend, open, frost." --metadata '{"kind":"objective","state":"open"}' --weight 0.85 2>/dev/null)

A=$(node "$BIN" --db "$DB" store "# Summary: morning arc — rehearsal secret recorded (2026-10-17 morning)

The gate alarm rehearsal got its secret phrase; the decision was stored with the why and the rejected alternative. The standing commitment is registered: memory://$O .

Keywords: summary, gate alarm, rehearsal, morning, recorded." --metadata '{"kind":"summary"}' --weight 0.85 2>/dev/null)

B=$(node "$BIN" --db "$DB" store "# Summary: afternoon arc — regrouping (2026-10-17 afternoon)

Afternoon arc closed; nothing new decided. The morning summary: memory://$A . The standing commitment stands: memory://$O .

Keywords: summary, regrouping, afternoon, closed." --metadata '{"kind":"summary"}' --weight 0.85 2>/dev/null)

# Graph edges mirror the authored links (3 total, none touching the needle):
node "$BIN" --db "$DB" link "$A" "$O" --kind references >/dev/null 2>&1
node "$BIN" --db "$DB" link "$B" "$A" --kind references >/dev/null 2>&1
node "$BIN" --db "$DB" link "$B" "$O" --kind references >/dev/null 2>&1

echo "directive=$D needle=$N objective=$O alpha=$A beta=$B"
node "$BIN" --db "$DB" stats 2>/dev/null
