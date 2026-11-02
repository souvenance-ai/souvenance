import { program } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { serve } from './actions.private/serve/serve.ts';

program.name('souvenance').description('AI memory.').version(pkg.version);

program
  .command('serve')
  .description('serve the API over HTTP (config: ~/.souvenance/config.json)')
  .option('--port <port>', 'port override', (value: string): number => Number.parseInt(value, 10))
  .option(
    '--log-requests <path>',
    'append one JSONL line per request to <path> (opt-in request log)',
  )
  .action((options: { port?: number; logRequests?: string }): Promise<void> => {
    return serve({ port: options.port, logRequests: options.logRequests });
  });

program.parse();
