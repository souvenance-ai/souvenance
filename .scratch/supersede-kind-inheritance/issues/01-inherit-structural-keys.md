# 01-inherit-structural-keys

Type: task
Status: resolved

## Question

`supersede` and `merge` write `metadata: null` on the successor when the caller passes no `--metadata`. The successor therefore drops out of every kind-scoped read ritual (`list --where "metadata->>'$.kind' = 'directive'"`, decisions list, summaries list) — kind is exactly what the CLI's filters select on, so a kind-less successor is invisible to recovery. Demonstrated on the real store on 2026-10-15: directive `b3f1551c` (sequential-writes revision, superseded at 12:11) was stored with `metadata: null` and went missing from the directives list until the cold-reader re-test caught it.

How should successor construction stop producing unclassifiable memories?

## Answer

Library-level structural inheritance in `Store` (`src/db.ts`):

- **When `opts.metadata` is absent** (supersede: from the old memory; merge: from all sources), the successor inherits the structural keys only:
  - `kind` carries when every source agrees on one kind; divergent kinds are omitted (ambiguous merge).
  - `tags` union across sources, order-stable, JSON-deduped.
  - Other metadata keys are never copied — contextual metadata describes the old content, not the successor.
- **When `opts.metadata` is given** it is used verbatim, no blending — explicit wins, predictable.
- Kind-less sources yield a kind-less successor (inherit is best-effort, not synthetic).

### Implementation

- Private `readMeta(id)`: raw parsed metadata without touching `access_count`.
- Private `structuralInherit(metas)`: the rule above.
- `supersede()` and `merge()` moved metadata construction inside the transaction (after `assertActive` reads, so the source row exists) and use `opts.metadata ?? structuralInherit(...)`.

### Rejected

- **Fail loudly on omitted metadata**: breaks the legit kind-less use; instead of forcing agents to repeat metadata, inherit the few keys that matter.
- **Full metadata copy**: leaks stale contextual keys (`session`, dates, domain) into content describing new state.
- **CLI guardrail only (skill guidance)**: no protection for non-skill callers; the defect showed the failure mode is silent drift, which guidance alone does not prevent.

### Verification

- 5 new tests in `src/writes.test.ts` (supersede inherit / explicit-verbatim / kindless; merge agree-kind-union-tags / divergent-kind-tags-union).
- 167/167 pass, `tsc --noEmit` clean.
- CLI smoke on a `/tmp` store: supersede of a kinded memory yields a successor with `{"kind":"directive","tags":["x"]}`.
- Real store data fixed separately: `memory update b3f1551c --metadata '{"kind":"directive"}' --weight 0.85` (one-off repair done before the library change landed).

### Docs

- `bin/memory.js` HELP Notes: one line on the inherit rule.
- SKILL.md: supersede descriptions (Evolving memories + dream step 3) now note that kind and tags inherit; pass `--metadata` to override.
