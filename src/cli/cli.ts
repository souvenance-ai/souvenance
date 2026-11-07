import { program } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { resolveLogRequests } from '../modules.private/config/config.ts';
import { type ConfigAnswer, configAction } from './actions.private/config/config.ts';
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

const configFamily = program
  .command('config')
  .description('the one config file (~/.souvenance/config.json): validate, get, file');

configFamily
  .command('file')
  .description('the config file’s path — never reads it')
  .action(() => emitConfigAnswer(configAction('file')));

configFamily
  .command('get')
  .description(
    'the effective config — defaults applied, secrets redacted, refuses a malformed file',
  )
  .action(() => emitConfigAnswer(configAction('get')));

configFamily
  .command('validate')
  .description('the strict grammar audit — the boot’s refusal taught before the restart')
  .action(() => emitConfigAnswer(configAction('validate')));

/** The family’s one stdout gesture (#17): exactly one JSON document, then the exit code. */
function emitConfigAnswer(answer: ConfigAnswer): void {
  process.stdout.write(`${JSON.stringify(answer.document)}\n`);
  process.exitCode = answer.exitCode;
}

program.parse();
