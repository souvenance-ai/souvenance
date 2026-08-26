# 01-slug-generation

Type: grilling
Status: resolved

## Question

How should the human-readable slug be derived from a memory's content for the export filename?

Context: filenames will be `<uuid-prefix>-<slug>.md`. The UUID prefix (first 8 chars) guarantees uniqueness, so the slug is for human readability only. But its derivation has real choices:

- **Source**: First line of content? First sentence? First N characters? The content is markdown — should we strip `#` headers, or use them as the slug?
- **Length**: How long? Too short and it's meaningless; too long and it defeats the purpose. A 40-60 char limit seems reasonable.
- **Sanitization**: How to handle spaces, special chars, non-ASCII, markdown syntax? Kebab-case (lowercase, hyphens) is conventional but may strip meaning from non-Latin scripts.
- **Edge cases**: Empty content? Content that's just a URL? Content that's only a `memory://` link? Content with no first line (just whitespace)?

The slug should be deterministic (same content → same slug) but the question is which derivation rule gives the best human experience when browsing a directory of 50+ memory files.

## Answer

Inspecting real memory content (`.ai-memory/test-eval.db`, 12 memories) revealed that content is dense prose paragraphs, not structured markdown with `#` headers. The first "line" is often a 500+ char paragraph. This shapes every decision:

### Source: first sentence, with header fallback

1. If the first line starts with `#` (markdown heading), strip the `#` prefix and use the heading text.
2. Otherwise, extract the first sentence: from the start of content up to the first `. `, `! `, or `? ` (period/space, etc.), or the first `\n`, whichever comes first.
3. If no sentence boundary found within 80 chars, hard-truncate at 80 chars (word boundary if possible).

Rationale: the first sentence of a well-written memory captures its essence ("The Store class in src/db.ts is the core of the library." → `store-class-in-src-db-ts-is-the-core`). Headers are used when present.

### Length: 50 chars max

Truncate to 50 chars, breaking at the last word boundary within the limit. If no word boundary (single long word), hard-truncate at 50.

- 50 chars is enough for a descriptive slug (`store-class-in-src-db-ts-is-the-core-of`)
- Short enough that `ls` output stays readable
- The UUID prefix already guarantees uniqueness, so truncation collisions are fine

### Sanitization: NFD-normalize, strip diacritics, kebab-case

```
1. content.normalize('NFD')                          // decompose accented chars
2. .replace(/[\u0300-\u036f]/g, '')                   // strip diacritics (é → e)
3. .toLowerCase()
4. .replace(/[^a-z0-9]+/g, '-')                       // non-alphanumeric → hyphen
5. .replace(/^-+|-+$/g, '')                            // trim leading/trailing hyphens
```

This handles French accents gracefully (`é` → `e`, `à` → `a`) without external dependencies. Non-Latin scripts (CJK, Arabic) will collapse to hyphens — acceptable for v1 since the store content is English/French.

### Edge cases

| Content | Slug |
|---------|------|
| Empty string or whitespace only | `empty` |
| Only a URL (`https://example.com/foo`) | `https-example-com-foo` |
| Only a `memory://` link | `memory` |
- Only punctuation/symbols (no alphanumerics after sanitization) | `untitled`
- Truncated slug ends up empty after sanitization | `untitled`

### Final filename format

```
<uuid-prefix-8>-<slug>.md
```

Example: `51f808a7-store-class-in-src-db-ts-is-the-core-of.md`
