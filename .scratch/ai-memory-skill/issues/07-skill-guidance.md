# SKILL.md: memory writing guidance + FTS5 query tips

Type: task
Status: resolved

## Question

Update `.agents/skills/ai-memory/SKILL.md` to address three gaps surfaced by the two-agent evaluation:

1. **FTS5 query syntax is undocumented.** A fresh session searching `memory search "design alternatives rejected"` got 0 hits because FTS5 doesn't match multi-word phrases that way. Agents need to know: quoted phrases (`"design alternatives"`), `OR` queries (`design OR alternatives`), and that FTS5 tokenizes on word boundaries. Without this, agents will miss memories they stored.

2. **No memory-writing guidance.** The evaluation found memories were self-contained and well-structured, but also dense paragraphs covering multiple concepts in one memory. The SKILL.md should add brief guidance: write self-contained memories (understandable without prior context), one concept per memory (more retrievable, more linkable), include the keywords you'd search for in the content.

3. **No session-summary convention.** The evaluation found no "orientation" memory — nothing a fresh session could search for to get oriented. Add a convention: at the end of each session, store a `kind: "summary"` memory that recaps what was done, key decisions, and what's next. This is the entry point for the next session's context recovery.

**Scope:**

- Edit `.agents/skills/ai-memory/SKILL.md` only (the thin agent-facing contract).
- Do not touch `CONTEXT.md` — no new domain terms are needed; "summary" is a `kind` value, not a new concept.
- Do not touch the library or CLI — this is guidance, not a system change.

**Acceptance:** SKILL.md has (a) an "FTS5 query tips" section with examples of phrase, OR, and single-word queries, (b) a "Writing good memories" section with the three guidelines, (c) a "Session summaries" convention in the exploration or conventions section. The file stays thin — one-line examples, no duplication of CLI reference.

## Answer

Updated `.agents/skills/ai-memory/SKILL.md` with three additions:

1. **FTS5 query tips** (after CLI, before Memory links): explains FTS5 word-boundary tokenization, implicit AND, and shows four query forms — single word, OR, quoted phrase, phrase+term. Includes a "narrowed to nothing" fallback tip.

2. **Writing good memories** (after Memory links, before Exploration): three guidelines — self-contained, one concept per memory, include search keywords. Each with a one-line rationale tying it to retrieval or graph properties.

3. **Session summaries** (appended to Conventions): store `kind: "summary"` at session end, search for it to get oriented next session, link to referenced memories.

All three placed in logical reading order. File stays thin: one-line CLI examples, no CLI reference duplication. No changes to CONTEXT.md, library, or CLI. Acceptance criteria met.

