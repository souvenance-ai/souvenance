/**
 * The skills surface's library (#82): the skills directory IS the truth,
 * like the registry — every folder under it is a skill, boot reads every
 * one and validates the format, and any refusal kills the boot: the wire
 * never serves a broken orientation, and half an orientation is a lie it
 * would serve as truth.
 *
 * One skill = one folder carrying a `SKILL.md` — frontmatter `name` +
 * `description` and nothing else, the served body served verbatim so an
 * installation is a copy, never a transform (#77: one standard, five
 * harnesses) — plus an optional `guidance.json`: the wire's voice,
 * server-side only, never installed. The folder whose name is the start
 * skill heads the index; the root pointer names it (`start`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The skills' name grammar (#82) — its own, not the stores' (32 chars, letter-first). */
export const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The index's head and the pointer's start: the posture skill ships first (#82). */
export const START_SKILL_NAME = 'waking';

/** The shipped skills directory — the package root's own, beside the source tree. */
const SHIPPED_SKILLS_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'skills');

const NAME_MAX_CHARS = 64;
const DESCRIPTION_MAX_CHARS = 1_024;
const BODY_MAX_LINES = 500;

/** The guidance conditions the wire knows — the code decides whether the voice speaks. */
const GUIDANCE_WHENS = new Set(['always', 'store-empty']);

/** The routes guidance may ride — the served set grows with the rituals (#82). */
const GUIDANCE_ROUTES = new Set(['checkin']);

/** One index row: the name and the description the startup hint serves. */
export interface SkillEntry {
  readonly name: string;
  readonly description: string;
}

/** The wire's voice beside the data: one imperative line, one skill pointer. */
export interface Guidance {
  readonly line: string;
  readonly skill: string;
}

/** One folder's declaration of where its voice speaks (#82). */
interface GuidanceDeclaration extends Guidance {
  readonly route: string;
  readonly when: string;
}

export class Skills {
  readonly #entries: readonly SkillEntry[];
  readonly #bodies: ReadonlyMap<string, string>;
  readonly #guidance: ReadonlyMap<string, readonly GuidanceDeclaration[]>;

  private constructor(
    entries: readonly SkillEntry[],
    bodies: ReadonlyMap<string, string>,
    guidance: ReadonlyMap<string, readonly GuidanceDeclaration[]>,
  ) {
    this.#entries = entries;
    this.#bodies = bodies;
    this.#guidance = guidance;
  }

  /**
   * Opens the skills directory: every folder is claimed and validated —
   * frontmatter `name` + `description` exactly, the name equal to the
   * folder (equal to the served `{name}` and to the install directory),
   * the description within the startup-hint cap, the body within the
   * progressive-disclosure cap, every guidance reference resolvable, and
   * the start skill present. Any refusal bubbles: the boot fails, nothing
   * serves half an orientation.
   */
  static open(skillsDir?: string): Skills {
    const dir = skillsDir ?? SHIPPED_SKILLS_DIR;
    const entries: SkillEntry[] = [];
    const bodies = new Map<string, string>();
    const guidance = new Map<string, GuidanceDeclaration[]>();
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const folder = dirent.name;
      const folderDir = join(dir, folder);
      const path = join(folderDir, 'SKILL.md');
      let content: string;
      try {
        content = readFileSync(path, 'utf8');
      } catch {
        throw new Error(
          `refusing to serve — the skill folder "${folder}" at ${folderDir} carries no SKILL.md: ` +
            `every folder in the skills directory is a skill, and half an orientation is a lie`,
        );
      }
      const { name, description } = Skills.#parse(`the skill file at ${path}`, content, folder);
      entries.push({ name, description });
      bodies.set(name, content);
      for (const declaration of Skills.#readGuidance(folderDir, folder)) {
        const route = guidance.get(declaration.route) ?? [];
        if (route.some((row) => row.when === declaration.when)) {
          throw new Error(
            `refusing to serve — the route "${declaration.route}" is spoken to twice on "${declaration.when}": ` +
              `guidance speaks in one line per route per condition (#82)`,
          );
        }
        route.push(declaration);
        guidance.set(declaration.route, route);
      }
    }
    if (!entries.some((entry) => entry.name === START_SKILL_NAME)) {
      throw new Error(
        `refusing to serve — the start skill "${START_SKILL_NAME}" is missing from ${dir}: ` +
          `the root pointer names it, and a pointer to nothing is a mute door`,
      );
    }
    for (const rows of guidance.values()) {
      for (const row of rows) {
        if (!bodies.has(row.skill)) {
          throw new Error(
            `refusing to serve — guidance points at "${row.skill}", which is no loaded skill: ` +
              `the voice points, it never dangles`,
          );
        }
      }
    }
    const start = entries.filter((entry) => entry.name === START_SKILL_NAME);
    const rest = entries
      .filter((entry) => entry.name !== START_SKILL_NAME)
      .sort((left, right) => (left.name < right.name ? -1 : 1));
    return new Skills([...start, ...rest], bodies, guidance);
  }

  /**
   * Parses one SKILL.md: the first line opens the frontmatter, the next
   * `---` closes it, and between them every line is `key: value` — the
   * keys are `name` and `description` and NOTHING else (the standard
   * tolerates more, the packaging hard-errors on more, #77). The body is
   * everything after, plain Markdown within the disclosure cap.
   */
  static #parse(
    context: string,
    content: string,
    folder: string,
  ): {
    name: string;
    description: string;
    body: string;
  } {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') {
      throw new Error(`refusing to serve — ${context} must open with the --- frontmatter fence`);
    }
    const close = lines.indexOf('---', 1);
    if (close === -1) {
      throw new Error(`refusing to serve — ${context} never closes its frontmatter fence`);
    }
    const frontmatter = new Map<string, string>();
    for (const line of lines.slice(1, close)) {
      if (line.trim() === '') continue;
      const sep = line.indexOf(':');
      if (sep === -1) {
        throw new Error(
          `refusing to serve — ${context} carries a frontmatter line with no "key:" shape: "${line}"`,
        );
      }
      const key = line.slice(0, sep).trim();
      const value = line.slice(sep + 1).trim();
      if (key !== 'name' && key !== 'description') {
        throw new Error(
          `refusing to serve — ${context} carries the frontmatter key "${key}": ` +
            `the frontmatter is name + description and nothing else (#77)`,
        );
      }
      if (frontmatter.has(key)) {
        throw new Error(`refusing to serve — ${context} states "${key}" twice`);
      }
      frontmatter.set(key, value);
    }
    const name = frontmatter.get('name') ?? '';
    const description = frontmatter.get('description') ?? '';
    if (name.length === 0 || name.length > NAME_MAX_CHARS || !SKILL_NAME.test(name)) {
      throw new Error(
        `refusing to serve — ${context} carries the name "${name}": the grammar is ` +
          `${SKILL_NAME.source} within ${NAME_MAX_CHARS} chars (the served {name} and the install directory must equal it)`,
      );
    }
    if (name !== folder) {
      throw new Error(
        `refusing to serve — ${context} names itself "${name}" inside the folder "${folder}": ` +
          `one name, three homes — the folder, the frontmatter, the served {name}`,
      );
    }
    if (description.length === 0 || description.length > DESCRIPTION_MAX_CHARS) {
      throw new Error(
        `refusing to serve — ${context} carries an empty description past the ${DESCRIPTION_MAX_CHARS}-char ` +
          `startup-hint cap: the description is the only hint visible at startup (#82)`,
      );
    }
    const body = lines.slice(close + 1).join('\n');
    if (body.trim().length === 0) {
      throw new Error(
        `refusing to serve — ${context} carries no body: a skill that says nothing orients nobody`,
      );
    }
    if (body.split('\n').length > BODY_MAX_LINES) {
      throw new Error(
        `refusing to serve — ${context} carries a body past ${BODY_MAX_LINES} lines: ` +
          `the progressive disclosure loads the whole body on demand (#77)`,
      );
    }
    return { name, description, body };
  }

  /** Reads one folder's guidance.json — absent is legal, malformed is a boot refusal. */
  static #readGuidance(folderDir: string, folder: string): readonly GuidanceDeclaration[] {
    const path = join(folderDir, 'guidance.json');
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `refusing to serve — the skill "${folder}" carries a guidance.json that is not JSON: ${(err as Error).message}`,
      );
    }
    const rows = (parsed as { guidance?: unknown }).guidance;
    if (!Array.isArray(rows)) {
      throw new Error(
        `refusing to serve — the skill "${folder}" carries a guidance.json with no guidance[] array`,
      );
    }
    return rows.map((row) => {
      const declaration = row as Partial<GuidanceDeclaration>;
      if (typeof declaration.route !== 'string' || !GUIDANCE_ROUTES.has(declaration.route)) {
        throw new Error(
          `refusing to serve — the skill "${folder}" declares guidance on "${String(declaration.route)}": ` +
            `the served set rides ${[...GUIDANCE_ROUTES].join(', ')} (#82)`,
        );
      }
      if (typeof declaration.when !== 'string' || !GUIDANCE_WHENS.has(declaration.when)) {
        throw new Error(
          `refusing to serve — the skill "${folder}" declares the condition "${String(declaration.when)}": ` +
            `the conditions the wire knows are ${[...GUIDANCE_WHENS].join(', ')}`,
        );
      }
      if (typeof declaration.line !== 'string' || declaration.line.trim().length === 0) {
        throw new Error(
          `refusing to serve — the skill "${folder}" declares guidance with no line to serve`,
        );
      }
      if (typeof declaration.skill !== 'string' || declaration.skill.length === 0) {
        throw new Error(
          `refusing to serve — the skill "${folder}" declares guidance with no skill to point at`,
        );
      }
      return {
        route: declaration.route,
        when: declaration.when,
        line: declaration.line,
        skill: declaration.skill,
      };
    });
  }

  /** The index rows, ordered — the start skill first, then alphabetical. */
  index(): readonly SkillEntry[] {
    return this.#entries;
  }

  /** One skill's body — the SKILL.md verbatim, ready to install. */
  item(name: string): string | undefined {
    return this.#bodies.get(name);
  }

  /**
   * The wire's voice for one route: `store-empty` overrides `always` on
   * the same route — an empty store has no past to continue, and the
   * continuity line would be noise. No match, no voice: undefined serves.
   */
  guidanceFor(route: string, flags: { readonly storeEmpty: boolean }): Guidance | undefined {
    const rows = this.#guidance.get(route) ?? [];
    if (flags.storeEmpty) {
      const unborn = rows.find((row) => row.when === 'store-empty');
      if (unborn !== undefined) return { line: unborn.line, skill: unborn.skill };
    }
    const always = rows.find((row) => row.when === 'always');
    return always !== undefined ? { line: always.line, skill: always.skill } : undefined;
  }
}
