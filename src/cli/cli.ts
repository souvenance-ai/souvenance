import { program } from 'commander';
import pkg from '../../package.json' with { type: 'json' };

program.name('souvenance').description('AI memory.').version(pkg.version);

/*
Template:

program
  .command('serve')
  .description('serve')
  .argument('<name>', 'name')
  .option('--port <port>', 'port', 3141)
  .action((name: string, options: { port: number }): Promise<void> => {
    return serve({
      ...options,
    });
  });
 */

program
  .command('serve')
  .description('serve')
  .argument('<name>', 'name')
  .option('--port <port>', 'port', 3141)
  .action((name: string, options: { port: number }): Promise<void> => {
    return serve({
      ...options,
    });
  });
