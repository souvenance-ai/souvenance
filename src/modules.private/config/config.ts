/**
 * The one config file (#17): `~/.souvenance/config.json` — strict, typed,
 * teaching on refusal. The server reads it at boot today; the manager CLI
 * inherits it tomorrow. Strictness is the contract: an unknown key or a
 * malformed grant refuses loudly (`ConfigError`) rather than guessing —
 * a typo'd `token` silently meaning nothing is how grants evaporate.
 * Credentials come in two families (#63): store grants (`tokens[]`, one
 * agent = one store) and management rows (`management[]`, the host's
 * management surface). A secret naming two rows is refused here — the
 * resolution would be ambiguous and the 429 bucket shared. A MISSING
 * file is not an error: the defaults are a cold host (loopback, no
 * credentials) — whether that serves is the boot's verdict, not the
 * file's (zero credentials refuse at boot, #63). Defaults here, policy
 * nowhere: the config file carries no behavior, only values.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/** The store-name grammar the whole surface shares (#19). */
export const STORE_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * The grant secret's grammar, carried from v0.1: `souv-` + 32–64
 * lowercase hex chars = 128–256 bits of entropy. Generated with
 * `echo souv-$(openssl rand -hex 16)`.
 */
export const SOUV_SECRET = /^souv-[0-9a-f]{32,64}$/;

export const DEFAULT_PORT = 3141;
export const DEFAULT_HOST = '127.0.0.1';

/**
 * One store grant = one agent = one store (#19, #63). Multi-grants per
 * agent are fine — a row per (agent, store) pair; the `agent` label is
 * what ties an agent's rows together.
 */
export interface StoreGrant {
  readonly agent: string;
  readonly secret: string;
  readonly store: string;
  readonly mode: 'ro' | 'rw';
}

/**
 * One management row = one agent on the host's management surface (#63):
 * create, list, describe, fork, and delete stores — and reach no store's
 * data. The operator's own credential when HTTP is wanted (#63).
 */
export interface ManagementGrant {
  readonly agent: string;
  readonly secret: string;
}

/**
 * The two credential families as one unit (#63): resolution walks both
 * arrays, the boot refuses when both are empty, and the config file
 * carries them side by side — they travel together, so they are typed
 * together. `tokens[]` rows are store grants (one agent = one store);
 * `management[]` rows are the host's management surface.
 */
export interface CredentialFamilies {
  readonly tokens: readonly StoreGrant[];
  readonly management: readonly ManagementGrant[];
}

/** The resolved config: every field present, defaults applied. */
export interface Config extends CredentialFamilies {
  readonly port: number;
  readonly host: string;
  readonly storesDir: string;
}

/** The refusal that maps to the CLI's exit 78 (#17): bad file, bad shape. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const storeGrantSchema = z.strictObject({
  agent: z.string().min(1),
  secret: z.string().regex(SOUV_SECRET),
  store: z.string().regex(STORE_NAME),
  mode: z.enum(['ro', 'rw']),
});

const managementGrantSchema = z.strictObject({
  agent: z.string().min(1),
  secret: z.string().regex(SOUV_SECRET),
});

const configSchema = z.strictObject({
  port: z.number().int().min(1).max(65_535).optional(),
  host: z.string().min(1).optional(),
  storesDir: z.string().min(1).optional(),
  tokens: z.array(storeGrantSchema).optional(),
  management: z.array(managementGrantSchema).optional(),
});

export function defaultConfigPath(): string {
  return join(homedir(), '.souvenance', 'config.json');
}

export function defaultStoresDir(): string {
  return join(homedir(), '.souvenance', 'stores');
}

/**
 * Expands a leading `~` — the one convenience the file format allows;
 * everything else stays literal.
 */
function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

/**
 * Parses and validates a raw value (the parsed JSON document) into a
 * resolved Config. Throws ConfigError with the schema's teaching on any
 * refusal — unknown keys included (strictObject) — and on a secret
 * naming two rows: resolution walks both families, a shared secret is
 * an ambiguity, and ambiguity in credentials is a refusal (#63).
 */
export function parseConfig(raw: unknown): Config {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`invalid config:\n${issues}`);
  }
  const tokens = parsed.data.tokens ?? [];
  const management = parsed.data.management ?? [];
  const bySecret = new Map<string, string[]>();
  for (const grant of [...tokens, ...management]) {
    const agents = bySecret.get(grant.secret) ?? [];
    agents.push(grant.agent);
    bySecret.set(grant.secret, agents);
  }
  const duplicateEntries = [...bySecret.entries()].filter(([, agents]) => agents.length > 1);
  if (duplicateEntries.length > 0) {
    const rows = duplicateEntries.map(([, agents]) => `"${agents.join('", "')}"`).join(', ');
    throw new ConfigError(
      `invalid config: the rows ${rows} share one secret — ` +
        `every row's secret must be unique across tokens[] and management[]`,
    );
  }
  return {
    port: parsed.data.port ?? DEFAULT_PORT,
    host: parsed.data.host ?? DEFAULT_HOST,
    storesDir: expandHome(parsed.data.storesDir ?? defaultStoresDir()),
    tokens,
    management,
  };
}

/**
 * Reads the config file. Missing file → the defaults (a cold host —
 * whether it serves is the boot's verdict, #63); unreadable or malformed
 * file → ConfigError. Syntactically valid JSON that fails the schema is
 * the same refusal as bad JSON: both mean the operator's hand slipped,
 * both teach.
 */
export function loadConfig(configPath: string = defaultConfigPath()): Config {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return parseConfig({});
    }
    throw new ConfigError(`cannot read config at ${configPath}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`config at ${configPath} is not valid JSON: ${(err as Error).message}`);
  }
  return parseConfig(parsed);
}
