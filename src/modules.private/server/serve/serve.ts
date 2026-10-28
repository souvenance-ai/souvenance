/**
 * The boot ceremony (#20): validate the exposure, open the registry
 * (fail-fast — every store claimed and opened or nothing serves), build
 * the app, listen with the explicit timeouts the long-lived listener
 * owes (carried from v0.1), and print the boot line to stderr — stdout
 * stays free for the CLI's JSON contract (#17, Q12).
 *
 * A non-loopback bind without tokens refuses before anything opens (#19):
 * a server the outside can reach with zero grants is an open memory.
 */
import { serve, type ServerType } from '@hono/node-server';
import type { TokenGrant } from '../../config/config.ts';
import { isLoopbackHost } from '../auth/auth.ts';
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
export interface ServeOptions {
  readonly port: number;
  readonly host: string;
  readonly storesDir: string;
  readonly tokens: readonly TokenGrant[];
}

export interface RunningServer {
  /** The bound port — resolved even when asked for 0 (the smoke test). */
  readonly port: number;
  close(): Promise<void>;
}

export async function startServer(options: ServeOptions): Promise<RunningServer> {
  if (!isLoopbackHost(options.host) && options.tokens.length === 0) {
    throw new Error(
      `refusing to bind ${options.host} without tokens — a server the outside can reach ` +
        `demands grants (#19); bind 127.0.0.1 or add tokens[] to ~/.souvenance/config.json`,
    );
  }
  const registry = Registry.open(options.storesDir);
  const app = createApp({ registry, tokens: options.tokens });
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
      `${options.tokens.length} grant(s) · http://${info.address}:${info.port}\n`,
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
