# 06 — export frontmatter renders metadata KEYS unsanitized: YAML key injection

Severity: low · Status: resolved

## The defect

`renderFrontmatter` interpolates metadata keys raw:

```ts
// src/export.ts:100-102
for (const [k, v] of rest) {
  lines.push(`  ${k}: ${toYamlValue(v, 1)}`);
}
```

VALUES are safe (`toYamlValue` JSON-quotes anything outside `^[\w\-./:]+$`), but a KEY containing a newline escapes the indented `metadata:` block:

metadata `{"x\ninjected: true": 1}` renders:

```yaml
metadata:
  x
injected: true: 1
```

— `injected: true` lands at column 0: a **top-level frontmatter field**. An attacker (or a buggy agent) who can author a memory in the store can forge `status:`, `id:`, `weight:` — whatever the export consumer parses. Consumers of exported markdown (SSGs, frontmatter parsers, the human reading a diff) trust these fields.

## Fix

Sanitize keys with the same rigor as values: a key must match `^[\w.-]+$` (no whitespace, no colon) — else JSON-quote the key (`"${k.replace(/"/g, '\\"')}"`) or replace offending chars with `_`. One helper, applied in both the `rest` loop and nowhere else (top-level keys `id/status/created_at/…` are literals).

## Test

export.test.ts: store a memory with metadata key `"bad\nkey: x"`, export, assert the emitted frontmatter parses back with exactly one nested metadata entry and zero new top-level fields.

## Resolution

`yamlKey` (src/export.ts) renders metadata keys raw only when they match `[\w.-]+`; anything else is JSON-double-quoted (valid YAML string key). Test in src/export.test.ts: a key carrying a newline / colon cannot create a top-level field.
