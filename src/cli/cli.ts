import { program } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { resolveLogRequests } from '../modules.private/config/config.ts';
import { serve } from './actions.private/serve/serve.ts';

program.name('souvenance').description('AI memory.').version(pkg.version);

program
  .command('serve')
  .description('serve the API over HTTP (config: ~/.souvenance/config.json)')
  .option('--port <port>', 'port override', (value: string): number => Number.parseInt(value, 10))
  .option(
    '--log-requests [path]',
    'append one JSONL line per request — a path, or bare for the default (~/.souvenance/logs.jsonl)',
  )
  .action(
    (options: {
      readonly port?: number;
      readonly logRequests?: string | boolean;
    }): Promise<void> => {
      return serve({ port: options.port, logRequests: resolveLogRequests(options.logRequests) });
    },
  );

program.parse();
