import type { Memory, Relation } from "./types.ts";

export function slugify(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "empty";

  const memoryLinkMatch = trimmed.match(/^memory:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (memoryLinkMatch) return "memory";

  let source: string;

  const firstLine = trimmed.split("\n")[0] ?? "";
  if (firstLine.startsWith("#")) {
    source = firstLine.replace(/^#+\s*/, "");
  } else {
    const sentenceEnd = firstLine.search(/[.!?]\s/);
    if (sentenceEnd !== -1 && sentenceEnd <= 80) {
      source = firstLine.slice(0, sentenceEnd);
    } else if (firstLine.length <= 80) {
      source = firstLine;
    } else {
      const truncated = firstLine.slice(0, 80);
      const lastSpace = truncated.lastIndexOf(" ");
      source = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
    }
  }

  source = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!source) return "untitled";

  if (source.length > 50) {
    const truncated = source.slice(0, 50);
    const lastHyphen = truncated.lastIndexOf("-");
    source = lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
    source = source.replace(/-+$/g, "");
  }

  if (!source) {
    return "untitled";
  }

  return source;
}

export function filenameFor(memory: Memory): string {
  const prefix = memory.id.slice(0, 8);
  const slug = slugify(memory.content);
  return `${prefix}-${slug}.md`;
}

function toYamlValue(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return "\n" + value.map((v) => `${pad}  - ${toYamlValue(v, indent + 1)}`).join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return (
      "\n" +
      entries
        .map(([k, v]) => `${pad}  ${k}: ${toYamlValue(v, indent + 1)}`)
        .join("\n")
    );
  }
  if (typeof value === "string") {
    if (/^[\w\-./:]+$/.test(value) && !/^\d/.test(value)) return value;
    return JSON.stringify(value);
  }
  return String(value);
}

export function renderFrontmatter(memory: Memory): string {
  const lines: string[] = ["---"];
  lines.push(`id: ${memory.id}`);
  lines.push(`status: ${memory.status}`);
  lines.push(`created_at: ${memory.created_at}`);
  lines.push(`weight: ${memory.weight}`);

  const meta = memory.metadata;
  if (meta) {
    if ("kind" in meta && meta["kind"] !== undefined) {
      lines.push(`kind: ${toYamlValue(meta["kind"], 0)}`);
    }
    if ("tags" in meta && meta["tags"] !== undefined) {
      lines.push(`tags: ${toYamlValue(meta["tags"], 0)}`);
    }
    const rest = Object.entries(meta).filter(([k]) => k !== "kind" && k !== "tags");
    if (rest.length > 0) {
      lines.push("metadata:");
      for (const [k, v] of rest) {
        lines.push(`  ${k}: ${toYamlValue(v, 1)}`);
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}

export function rewriteLinks(
  content: string,
  idToFilename: Map<string, string>,
): string {
  return content.replace(/memory:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi, (match, uuid) => {
    const filename = idToFilename.get(uuid);
    if (!filename) return match;
    const slug = filename.replace(/\.md$/, "").replace(/^[0-9a-f]{8}-/, "");
    return `[${slug}](./${filename})`;
  });
}

export function renderRelations(
  relations: Relation[],
  memoryId: string,
  idToFilename: Map<string, string>,
): string {
  const outgoing = relations.filter((r) => r.from_id === memoryId);
  const incoming = relations.filter((r) => r.to_id === memoryId);

  if (outgoing.length === 0 && incoming.length === 0) return "";

  const sections: string[] = ["## Relations", ""];

  if (outgoing.length > 0) {
    sections.push("### Outgoing", "");
    for (const r of outgoing) {
      const filename = idToFilename.get(r.to_id);
      if (filename) {
        const slug = filename.replace(/\.md$/, "").replace(/^[0-9a-f]{8}-/, "");
        sections.push(`- ${r.kind} → [${slug}](./${filename})`);
      } else {
        sections.push(`- ${r.kind} → memory://${r.to_id} (not in export)`);
      }
    }
    sections.push("");
  }

  if (incoming.length > 0) {
    sections.push("### Incoming", "");
    for (const r of incoming) {
      const filename = idToFilename.get(r.from_id);
      if (filename) {
        const slug = filename.replace(/\.md$/, "").replace(/^[0-9a-f]{8}-/, "");
        sections.push(`- ${r.kind} ← [${slug}](./${filename})`);
      } else {
        sections.push(`- ${r.kind} ← memory://${r.from_id} (not in export)`);
      }
    }
    sections.push("");
  }

  return sections.join("\n").trimEnd() + "\n";
}

export function renderMemory(
  memory: Memory,
  relations: Relation[],
  idToFilename: Map<string, string>,
): string {
  const frontmatter = renderFrontmatter(memory);
  const body = rewriteLinks(memory.content, idToFilename);
  const relSection = renderRelations(relations, memory.id, idToFilename);

  const parts = [frontmatter, "", body];
  if (relSection) {
    parts.push("", relSection);
  }

  return parts.join("\n") + "\n";
}
