/**
 * The boot ceremony (#20): validate the exposure, open the registry
 * (fail-fast — every store claimed and opened or nothing serves), build
 * the app, listen with the explicit timeouts the long-lived listener
 * owes (carried from v0.1), and print the boot line to stderr — stdout
 * stays free for the CLI's JSON contract (#17, Q12).
 *
 * A zero-credential host refuses before anything opens (#63): no token,
 * no memory — a host nobody can touch refuses to serve. The credentials
 * come in two families: store grants and management rows; a
 * management-only boot is legal — it is how a fresh host births its
 * first store.
 */
import { serve, type ServerType } from '@hono/node-server';
import { appendFileSync } from 'node:fs';
import {
  sharedSecretAgents,
  sharedSecretTeaching,
  type CredentialFamilies,
} from '../../config/config.ts';
import { Registry } from '../registry/registry.ts';
import { createApp } from '../server.ts';

/** The long-lived listener's explicit timeouts (carried from v0.1). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const HEADERS_TIMEOUT_MS = 10_000;
export const KEEPALIVE_TIMEOUT_MS = 5_000;

/**
 * The fully resolved exposure — the caller (config, the CLI) owns the
 * defaults; the server owns none.
 */
export interface ServeOptions extends CredentialFamilies {
  readonly port: number;
  readonly host: string;
  readonly storesDir: string;
  /** The package version, surfaced in the OpenAPI document. */
  readonly version: string;
  /** The opt-in request log's JSONL path (#69); absent = the log is off. */
  readonly logRequests?: string;
  /**
   * The one config file the credential doors author (#98); absent — a
   * programmatic boot with inline credentials — the mint and revoke
   * refuse with the teaching, the list serves the live state alone.
   */
  readonly configPath?: string;
}

export interface RunningServer {
  /** The bound port — resolved even when asked for 0 (the smoke test). */
  readonly port: number;
  close(): Promise<void>;
}

export async function startServer(options: ServeOptions): Promise<RunningServer> {
  if (options.tokens.length === 0 && options.management.length === 0) {
    throw new Error(
      `refusing to start — zero credentials: no token, no memory; ` +
        `mint a grant in tokens[] or management[] of ~/.souvenance/config.json`,
    );
  }
  // The #74 rider: the duplicate-secret walk at the programmatic boot.
  // The file path refuses a shared secret at parse; a hand-built
  // ServeOptions never met it — and resolveBearer resolves a duplicate
  // by first match. With the grant as the address, a duplicated secret
  // is silent arbitrary addressing: refused here, not hidden.
  const shared = sharedSecretAgents([...options.tokens, ...options.management]);
  if (shared.length > 0) {
    throw new Error(`refusing to start — ${sharedSecretTeaching(shared)}`);
  }
  const registry = Registry.open(options.storesDir);
  // The #19 boot validation: a grant naming a store the registry does not
  // open is refused, not hidden — such a grant could only ever serve 404s
  // forever. The teaching names the offending stores and the remedy, and
  // the boot backs out of every claim it opened before refusing.
  const unknown = options.tokens.filter((grant) => !registry.names().includes(grant.store));
  if (unknown.length > 0) {
    const rows = unknown.map((grant) => `"${grant.store}" (${grant.agent})`).join(', ');
    registry.close();
    throw new Error(
      `refusing to start — ${rows} name no store the registry opened at ${options.storesDir}: ` +
        `create the store(s) or fix the token rows`,
    );
  }
  // The opt-in request log (#69): the file opens in append mode at boot —
  // a restart never truncates the history — and the banner names it, so
  // the operator can tail before the first request. Off: nothing here.
  // An unopenable path refuses the boot with the teaching — the same
  // fail-fast voice as every other exposure — and releases the claims it
  // opened, like the unknown-grant refusal beside it.
  if (options.logRequests !== undefined) {
    try {
      appendFileSync(options.logRequests, '', 'utf8');
    } catch (err) {
      registry.close();
      throw new Error(
        `refusing to start — cannot open the request log at ${options.logRequests}: ` +
          `${(err as Error).message}`,
      );
    }
  }
  const app = createApp({
    registry,
    tokens: options.tokens,
    management: options.management,
    version: options.version,
    logRequests: options.logRequests,
    configPath: options.configPath,
  });
  // The listening is awaited: the boot resolves only once the bound port
  // is known (the smoke test asks for 0 and reads the real one).
  let server!: ServerType;
  const listening = new Promise<{ address: string; port: number }>((resolve, reject) => {
    server = serve(
      {
        fetch: app.fetch,
        hostname: options.host,
        port: options.port,
        serverOptions: {
          requestTimeout: REQUEST_TIMEOUT_MS,
          headersTimeout: HEADERS_TIMEOUT_MS,
          keepAliveTimeout: KEEPALIVE_TIMEOUT_MS,
        },
      },
      (info) => resolve(info),
    );
    server.once('error', reject);
  });
  let info: { address: string; port: number };
  try {
    info = await listening;
  } catch (err) {
    registry.close();
    throw err;
  }
  process.stderr.write(
    `souvenance · ${registry.names().length} store(s) · ` +
      `${options.tokens.length} grant(s) · ${options.management.length} management · ` +
      `http://${info.address}:${info.port}` +
      (options.logRequests !== undefined ? ` · requests → ${options.logRequests}` : '') +
      `\n`,
  );

  return {
    get port() {
      return info.port;
    },
    async close(): Promise<void> {
      // Idle keep-alive sockets would hold the close for the keep-alive
      // timeout — dropped, the shutdown is prompt. (The union ServerType
      // predates closeAllConnections; the node server has it.)
      (server as unknown as { closeAllConnections(): void }).closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      registry.close();
    },
  };
}
