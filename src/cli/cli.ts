import { program } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { resolveLogRequests } from '../modules.private/config/config.ts';
import { type ConfigAnswer, configAction } from './actions.private/config/config.ts';
import { grantAction, type GrantAnswer } from './actions.private/grant/grant.ts';
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
  .description('the config file\u2019s path — never reads it')
  .action(() => emitAnswer(configAction('file')));

configFamily
  .command('get')
  .description(
    'the effective config — defaults applied, secrets redacted, refuses a malformed file',
  )
  .action(() => emitAnswer(configAction('get')));

configFamily
  .command('validate')
  .description('the strict grammar audit — the boot\u2019s refusal taught before the restart')
  .action(() => emitAnswer(configAction('validate')));

const grantFamily = program
  .command('grant')
  .description(
    'the credential families — the manager\u2019s offline hands on the file; while the server runs, its writes refuse and the wire serves the store family',
  );

const grantStore = grantFamily
  .command('store')
  .description('the store grants (tokens[]) — one agent, one store, one mode');

grantStore
  .command('add')
  .description('mint a store grant — the secret served exactly once, on a TTY')
  .argument(
    '<agent>',
    'the agent\u2019s label — the request log\u2019s caller axis; per-terminal labels are preferred',
  )
  .argument('<store>', 'the store the grant reaches')
  .argument('<mode>', 'ro or rw')
  .action((agent: string, store: string, mode: string): Promise<void> =>
    grantAction('store add', { agent, store, mode }).then(emitAnswer),
  );

grantStore
  .command('list')
  .description('the store\u2019s grant rows — never a secret')
  .action(() => grantAction('store list', {}).then(emitAnswer));

grantStore
  .command('reveal')
  .description('a grant\u2019s secret — on a TTY alone, it never crosses a pipe')
  .argument('<agent>', 'the agent\u2019s label')
  .argument('<store>', 'the store the grant reaches')
  .action((agent: string, store: string): Promise<void> =>
    grantAction('store reveal', { agent, store }).then(emitAnswer),
  );

grantStore
  .command('remove')
  .description('revoke a store grant — the row leaves the file, effective on the next boot')
  .argument('<agent>', 'the agent\u2019s label')
  .argument('<store>', 'the store the grant reached')
  .action((agent: string, store: string): Promise<void> =>
    grantAction('store remove', { agent, store }).then(emitAnswer),
  );

const grantManagement = grantFamily
  .command('management')
  .description('the management rows (management[]) — the host\u2019s hands, no wire door');

grantManagement
  .command('add')
  .description('mint a management grant — the secret served exactly once, on a TTY')
  .argument('<agent>', 'the agent\u2019s label')
  .action((agent: string): Promise<void> =>
    grantAction('management add', { agent }).then(emitAnswer),
  );

grantManagement
  .command('list')
  .description('the management rows — never a secret')
  .action(() => grantAction('management list', {}).then(emitAnswer));

grantManagement
  .command('reveal')
  .description('a management row\u2019s secret — on a TTY alone')
  .argument('<agent>', 'the agent\u2019s label')
  .action((agent: string): Promise<void> =>
    grantAction('management reveal', { agent }).then(emitAnswer),
  );

grantManagement
  .command('remove')
  .description('revoke a management grant — the row leaves the file, effective on the next boot')
  .argument('<agent>', 'the agent\u2019s label')
  .action((agent: string): Promise<void> =>
    grantAction('management remove', { agent }).then(emitAnswer),
  );

/** The one stdout gesture (#17): exactly one JSON document, then the exit code. */
function emitAnswer(answer: ConfigAnswer | GrantAnswer): void {
  process.stdout.write(`${JSON.stringify(answer.document)}\n`);
  process.exitCode = answer.exitCode;
}

program.parse();
