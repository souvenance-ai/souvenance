# 03-markdown-rendering

Type: grilling
Status: resolved
Blocked by: 01

## Question

What is the exact markdown format for each exported memory file?

Context: The file has two parts — YAML frontmatter and the body. The body is the memory content with `memory://` links rewritten. Here are the specific decisions:

**Frontmatter fields**:
- Which fields? `id`, `kind`, `tags`, `status`, `created_at` are obvious. Should `metadata` be fully serialized (all keys), or only known ones? What about metadata keys that aren't `kind`/`tags` — do they go in frontmatter too, or get dropped?
- How to handle `metadata: null`? Omit the field, or write `null`?
- Date format: ISO 8601 as stored, or human-readable (e.g. `2026-01-15`)?

**Link rewriting** (`memory://<uuid>` → `./<file>.md`):
- Should the rewritten link be a markdown link (`[text](./file.md)`) or a bare path? The original `memory://` is usually bare text, not markdown-wrapped.
- What if the target memory isn't in the store (broken link)? Leave as `memory://...`? Strip it? Add a comment?
- Should the link text include the target's slug/title for readability, or stay as the raw UUID?

**Relations section** (`## Relations`):
- Format: bulleted list of `→ [kind] ./<file>.md`? Or grouped by kind? Or a table?
- Direction: show `from → to` arrows, or list out-going and in-coming separately?
- Should relation metadata (e.g. `{ weight: 0.9 }`) be included?
- What if a relation points to a memory not in the export (shouldn't happen with full export, but defensive)?

**Edge cases**:
- Empty content: frontmatter + empty body, or a placeholder?
- Content that is only whitespace: same question.
- Metadata with deeply nested objects: how deep to render in YAML?

This ticket decides the template that the implementation will use.

## Answer

### Frontmatter

Lift `kind` and `tags` out of metadata into top-level fields. They're the two keys the CLI explicitly filters on, so they're first-class in the domain even if they live inside metadata in the schema. Remaining metadata keys nest under `metadata:`.

```yaml
---
id: 51f808a7-...
kind: decision
tags: [api, rest, graphql]
status: active
created_at: 2026-01-15T10:30:00.000Z
metadata:
  domain: auth
  date: 2026-01-15
---
```

- **`metadata: null`**: omit `kind`, `tags`, and `metadata:` entirely. No `null` written.
- **Date format**: ISO 8601 as stored (preserves time, sortable, unambiguous).
- **Nested metadata**: render as-is under `metadata:` key. No depth limit for v1.

### Link rewriting

`memory://<uuid>` rewritten to markdown link with slug text: `[slug](./<uuid8>-<slug>.md)`.

- Clickable in any markdown renderer, slug gives context (uses slug from ticket 01).
- **Broken link** (target not in store): leave as `memory://<uuid>` — honest representation.

### Relations section

`## Relations` with `### Outgoing` and `### Incoming` subsections. Bulleted list with arrows:

```markdown
## Relations

### Outgoing

- references → [jwt-decision](./f6eb89e2-jwt-decision.md)
- contradicts → [json-file-approach](./f474b1f0-json-file-approach.md)

### Incoming

- extends ← [markdown-approach](./a831cadb-markdown-approach.md)
```

- **No relations**: omit `## Relations` entirely (no empty heading).
- **Relation metadata**: not included (rarely used in real data; can be added later as a bullet suffix if needed).
- **Relation target not in export**: `- references → memory://<uuid> (not in export)` instead of a broken file link.

### Edge cases

- **Empty/whitespace content**: frontmatter + empty body. No placeholder text.
