import { program } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { serve } from './actions.private/serve/serve.ts';

program.name('souvenance').description('AI memory.').version(pkg.version);

program
  .command('serve')
  .description('serve')
  .argument('<name>', 'name')
  .option('--port <port>', 'port', (value: string): number => Number.parseInt(value, 10), 3141)
  .action((_name: string, options: { port: number }): Promise<void> => {
    return serve({
      ...options,
    });
  });
