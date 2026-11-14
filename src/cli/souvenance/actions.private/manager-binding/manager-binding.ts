/**
 * The manager's own binding (Q23 of #49's grilling, the slice's Q2
 * ruling): the host's tool resolves its credential from the host's
 * config — the URL from the configured `host:port`, the token from the
 * config's management rows. Exactly one row serves; several refuse
 * naming the labels (the file is ambiguous about who calls); none
 * refuses with the teaching (the offline mint is the row's only birth —
 * the wire never serves management rows). `SOUVENANCE_URL` and
 * `SOUVENANCE_TOKEN` override, per variable (the slice's Q2 ruling):
 * each env var, present and non-empty, overrides its own side — the
 * other side still resolves from the config, so a remote host with an
 * explicit token needs no file at all, and a same-host gesture needs
 * no exports at all. An explicit token silences the config's ambiguity:
 * the several-rows refusal applies only when the config's rows are the
 * token's source. The URL's env path rides the shared binding grammar
 * (ADR 0008 — one grammar, both doors); the config's URL is always
 * `http://` — the server speaks plain HTTP, no TLS knob exists.
 *
 * Every refusal is a ConfigError — the family the CLI maps to exit 78
 * (#17): the binding is the manager's config, a slipped hand teaches.
 */
import { ConfigError, type Config } from '../../../../modules.private/config/config.ts';
import { normalizeUrl, type Binding } from '../../../../modules.private/mcp/binding/binding.ts';

/** The environment's shape — the record `process.env` gives. */
type Environment = Readonly<Record<string, string | undefined>>;

/** The env var is an override only when it is present and non-empty. */
function override(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value : undefined;
}

/**
 * The config's own URL. The host rides the URL bracketed when it is an
 * IPv6 literal — `http://[::1]:3141` travels, the bare `http://::1:3141`
 * throws the URL parser before a request exists (the review's find);
 * httpCall strips the brackets back off for the socket, where the bare
 * literal is the honest form (its own lesson, the probe's review). A
 * host the URL grammar cannot carry at all is the binding's verdict,
 * not a crash: the liveness probe judges such a host not-alive for the
 * file's writes, and the wire verbs cannot even compose their request —
 * the teaching (exit 78) is the honest door.
 */
function composeConfigUrl(config: Config): string {
  const host = config.host.includes(':') ? `[${config.host}]` : config.host;
  const url = `http://${host}:${config.port}`;
  try {
    new URL(url);
  } catch {
    throw new ConfigError(
      `invalid binding — the configured host "${config.host}" does not travel as a URL host ` +
        `(${url}) — fix the config\u2019s host, or set SOUVENANCE_URL for the remote one`,
    );
  }
  return url;
}

export function resolveManagerBinding(environment: Environment, config: Config): Binding {
  const envUrl = override(environment['SOUVENANCE_URL']);
  const url = envUrl !== undefined ? normalizeUrl(envUrl) : composeConfigUrl(config);
  const envToken = override(environment['SOUVENANCE_TOKEN']);
  if (envToken !== undefined) return { url, token: envToken };
  const soleRow = config.management.length === 1 ? config.management[0] : undefined;
  if (soleRow === undefined) {
    if (config.management.length === 0) {
      throw new ConfigError(
        'invalid binding — the config carries no management row and SOUVENANCE_TOKEN is absent: ' +
          'the management surface is the host\u2019s hands, and its rows are born offline. ' +
          'Mint one (souvenance grant management add <agent>) or set SOUVENANCE_TOKEN for a remote host.',
      );
    }
    const labels = config.management.map((row) => row.agent).join(', ');
    throw new ConfigError(
      `invalid binding — the config carries ${config.management.length} management rows (${labels}): ` +
        'the manager needs exactly one. Keep one row, or set SOUVENANCE_TOKEN to name the caller.',
    );
  }
  return { url, token: soleRow.secret };
}
