/**
 * The `serve` action (slice 1): load the one config file, start the
 * server with its resolved values, hold until a signal. The flag is the
 * one override (--port, Q5); the config file is the truth. A refused
 * config is the CLI's exit 78 (#17) — the refusal message teaches, the
 * code says "configuration".
 */
import { loadConfig } from '../../../modules.private/config/config.ts';
import { startServer } from '../../../modules.private/server/serve/serve.ts';
import pkg from '../../../../package.json' with { type: 'json' };

export interface ServeOptions {
  readonly port?: number;
}

export async function serve(options: ServeOptions): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exitCode = 78;
    return;
  }
  const running = await startServer({
    port: options.port ?? config.port,
    host: config.host,
    storesDir: config.storesDir,
    tokens: config.tokens,
    version: pkg.version,
  });
  const shutdown = (): void => {
    void running.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  // The server runs until a signal closes it — the action holds open.
  await new Promise<never>(() => undefined);
}
