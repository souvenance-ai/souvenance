/**
 * The bridge's binding: how a stdio process learns where the server lives
 * and which grant speaks for it (#22). The environment is the contract —
 * an MCP client launches the bridge as a subprocess and injects its
 * configuration through the client config's env block, the one mechanism
 * every client supports (the MCP spec governs the wire, not client
 * config; the working directory is unreliable across clients; a token
 * never rides argv, where ps and consent dialogs read it back).
 *
 * `SOUVENANCE_URL` is optional: absent, the server's own loopback
 * defaults stand — one default, both sides of the wire, no drift.
 * `SOUVENANCE_TOKEN` is the grant: required, never defaulted, never
 * guessed. A bridge without a grant is the freestyle loopback operator
 * #63 retired — it refuses at open with the teaching instead. The
 * secret's grammar is judged by the server (one grammar, one judge);
 * the bridge only refuses its absence and a malformed URL.
 *
 * The refusal is a ConfigError — the same family the CLI maps to exit 78
 * (#17): the binding is the bridge's config, and a slipped hand teaches.
 */
import { ConfigError, DEFAULT_HOST, DEFAULT_PORT } from '../../config/config.ts';

/** One resolved binding: the server's base URL and the grant's secret. */
export interface Binding {
  readonly url: string;
  readonly token: string;
}

/** The default binding's URL — the server's own boot defaults, composed once. */
const DEFAULT_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

/** The environment's shape — the record `process.env` gives, both doors' source. */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The env var is the binding's value only when it is present and
 * non-blank — one grammar, both doors (ADR 0008): the bridge refuses a
 * blank token with the teaching, the manager treats a blank var as no
 * override. The value rides untrimmed; each door judges its own shape.
 */
export function boundEnv(environment: Environment, key: string): string | undefined {
  const value = environment[key];
  return value !== undefined && value.trim().length > 0 ? value : undefined;
}

/**
 * Resolves the binding from an environment record (the shape of
 * `process.env`). Throws ConfigError with the teaching when the grant is
 * absent or the URL is malformed — the bridge refuses to speak before
 * it can address its own store.
 */
export function resolveBinding(environment: Environment): Binding {
  const token = boundEnv(environment, 'SOUVENANCE_TOKEN');
  if (token === undefined) {
    throw new ConfigError(
      'invalid binding — SOUVENANCE_TOKEN is absent: the bridge carries exactly one store ' +
        'grant (one Bearer = one store, the grant is the address). Set SOUVENANCE_TOKEN in the ' +
        'environment your MCP client injects, plus SOUVENANCE_URL when the server does not ' +
        'answer on the default loopback port. The operator mints the grant.',
    );
  }
  const rawUrl = boundEnv(environment, 'SOUVENANCE_URL');
  return {
    url: rawUrl === undefined ? DEFAULT_URL : normalizeUrl(rawUrl),
    token,
  };
}

/**
 * Trailing slashes off, whitespace trimmed — the URL is otherwise verbatim.
 * Exported for the shared grammar's second consumer (the manager's
 * config-first binding): one URL grammar, both doors, ADR 0008.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConfigError(
      `invalid binding — SOUVENANCE_URL "${trimmed}" is not a URL (a base like http://127.0.0.1:3141)`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(
      `invalid binding — SOUVENANCE_URL must speak http or https, not "${parsed.protocol}"`,
    );
  }
  return trimmed;
}
