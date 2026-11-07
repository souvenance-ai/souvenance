/**
 * The `config` family (the manager CLI’s first implementation slice, #48):
 * the operator’s window onto the one config file. Three verbs, one JSON
 * document each on stdout (#17): `file` names the path (never reads it),
 * `get` serves the EFFECTIVE config — the same resolution the server
 * boots on, defaults filled — with every secret redacted (a secret’s
 * only doors are mint and reveal, both TTY-only, #48), and `validate`
 * is the strict grammar audit on the operator’s schedule: the boot’s
 * own refusal, taught before the restart instead of at it. A malformed
 * file refuses everywhere with exit 78 (#17): `get` never falls back to
 * defaults over a broken file — strictness is the config module’s
 * contract, the CLI inherits it. The action answers; cli.ts prints and
 * exits.
 */
import {
  type Config,
  ConfigError,
  defaultConfigPath,
  loadConfig,
} from '../../../modules.private/config/config.ts';

export type ConfigCommand = 'file' | 'get' | 'validate';

/** A store grant as `get` serves it — the secret never crosses stdout. */
export interface RedactedStoreGrant {
  readonly agent: string;
  readonly secret: 'redacted';
  readonly store: string;
  readonly mode: 'ro' | 'rw';
}

/** A management row as `get` serves it — the secret never crosses stdout. */
export interface RedactedManagementGrant {
  readonly agent: string;
  readonly secret: 'redacted';
}

/** The effective config as `get` serves it (#48): defaults filled, secrets redacted. */
export interface RedactedConfig {
  readonly port: number;
  readonly host: string;
  readonly storesDir: string;
  /** The resolved JSONL path (#69); absent = the request log is off. */
  readonly logRequests?: string;
  readonly tokens: readonly RedactedStoreGrant[];
  readonly management: readonly RedactedManagementGrant[];
}

/** The one JSON document each config verb serves on stdout (#17). */
export type ConfigDocument =
  | { readonly file: string }
  | { readonly valid: true }
  | { readonly error: string }
  | RedactedConfig;

/**
 * What every config verb answers: the document and its exit code. 0 =
 * served; 78 = the config refused (#17’s configuration exit — the same
 * verdict the server’s boot would give).
 */
export interface ConfigAnswer {
  readonly document: ConfigDocument;
  readonly exitCode: 0 | 78;
}

export function configAction(
  command: ConfigCommand,
  configPath: string = defaultConfigPath(),
): ConfigAnswer {
  if (command === 'file') {
    return { document: { file: configPath }, exitCode: 0 };
  }
  try {
    const config = loadConfig(configPath);
    return command === 'get'
      ? { document: redactConfig(config), exitCode: 0 }
      : { document: { valid: true }, exitCode: 0 };
  } catch (err) {
    return {
      document: { error: err instanceof ConfigError ? err.message : String(err) },
      exitCode: 78,
    };
  }
}

function redactConfig(config: Config): RedactedConfig {
  return {
    port: config.port,
    host: config.host,
    storesDir: config.storesDir,
    logRequests: config.logRequests,
    tokens: config.tokens.map((grant) => ({
      agent: grant.agent,
      secret: 'redacted',
      store: grant.store,
      mode: grant.mode,
    })),
    management: config.management.map((grant) => ({ agent: grant.agent, secret: 'redacted' })),
  };
}
