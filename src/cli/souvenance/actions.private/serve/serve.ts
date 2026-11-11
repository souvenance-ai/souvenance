/**
 * The `serve` action (slice 1): load the one config file, start the
 * server with its resolved values, hold until a signal. The flags are
 * the overrides (--port, Q5; --log-requests, #69); the config file is
 * the truth. A refused config is the CLI's exit 78 (#17) — the refusal
 * message teaches, the code says "configuration".
 */
import { defaultConfigPath, loadConfig } from '../../../../modules.private/config/config.ts';
import { startServer } from '../../../../modules.private/server/serve/serve.ts';
import pkg from '../../../../../package.json' with { type: 'json' };

export interface ServeOptions {
  readonly port?: number;
  readonly logRequests?: string;
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
    logRequests: options.logRequests ?? config.logRequests,
    tokens: config.tokens,
    management: config.management,
    // The credential doors (#98) author the one config the boot read.
    configPath: defaultConfigPath(),
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
