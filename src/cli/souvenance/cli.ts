/**
 * The `souvenance` bin — the host's tool (ADR 0002): one tool, two
 * states (the slice's Q0 ruling, #105). The file world when the server
 * is down — `serve` (the door out of the down state), `config`, `grant`
 * (the offline hands, refusing while the server runs), `fork` (the
 * offline copy) — and the wire world when it runs: `stores`, the
 * management surface's remote gesture, the manager's own binding
 * resolving it (the config's host:port and management rows, the env
 * overrides per variable). One JSON document per invocation (#17), the
 * wire's refusals verbatim, the wire's echoes composed where it serves
 * none (the delete, the revoke). The parser's errors ride `exitOverride`
 * — commander would exit on stderr, and the one-document contract
 * demands every refusal teach on stdout (the souv precedent, extended
 * to the second bin; the positionals stay optional at the parser, the
 * actions' own gates teach).
 */
import { CommanderError, program } from 'commander';
import { writeSync } from 'node:fs';
import pkg from '../../../package.json' with { type: 'json' };
import {
  ConfigError,
  loadConfig,
  resolveLogRequests,
} from '../../modules.private/config/config.ts';
import type { AnswerOf } from '../../modules.private/cli/answer-of/answer-of.ts';
import type { Binding } from '../../modules.private/mcp/binding/binding.ts';
import { type ConfigAnswer, configAction } from './actions.private/config/config.ts';
import { grantAction, type GrantAnswer } from './actions.private/grant/grant.ts';
import { type ForkArgs, forkAction, type ForkAnswer } from './actions.private/fork/fork.ts';
import { serve } from './actions.private/serve/serve.ts';
import { resolveManagerBinding } from './actions.private/manager-binding/manager-binding.ts';
import { refusalOf } from './actions.private/refusal/refusal.ts';
import {
  storesCreate,
  storesDelete,
  storesDescribe,
  storesFork,
  storesList,
} from './actions.private/stores/stores.ts';
import {
  storesGrantsList,
  storesGrantsMint,
  storesGrantsRevoke,
} from './actions.private/stores-grants/stores-grants.ts';

program
  .name('souvenance')
  .description(
    'the host\u2019s tool — the file world when the server is down, the wire world (stores) when it runs',
  )
  .version(pkg.version)
  // The override before the commands: the subcommands inherit the
  // parser's settings at their creation — set late, they would keep
  // commander's own process.exit and the contract's envelope would
  // never see the parser's refusals (the souv bin's precedent).
  .exitOverride();

program
  .command('serve')
  .description('boot the wire — the door out of the down state (config: ~/.souvenance/config.json)')
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
  .description(
    'the one config file (~/.souvenance/config.json): validate, get, file — the file world',
  );

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
    'the credential families — the file world\u2019s hands; while the server runs, its writes refuse and the wire serves the store family',
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

const forkFamily = program
  .command('fork')
  .description(
    'the offline fork — the file world\u2019s copy, born unreached; refuses while the server owns (fork on the wire, then)',
  );

forkFamily
  // The source is optional AT THE PARSER: Commander's arg-count check
  // would reject `souvenance fork` on stderr and exit 2 — the one JSON
  // document per answer (#17) demands the absence ride to the action's
  // own gate, which asks for the shape in the verb's JSON voice.
  .argument('[source]', 'the store to copy')
  .argument('[target]', 'the child\u2019s name — composed from the source\u2019s name when silent')
  .option(
    '--grant <agent>',
    'mint the child\u2019s first grant in the same gesture — the birth\u2019s own mint',
  )
  .option(
    '--mode <mode>',
    'the birth grant\u2019s mode — ro or rw (pairs with --grant; default rw)',
  )
  .action(
    (
      source: string | undefined,
      target: string | undefined,
      options: Pick<ForkArgs, 'grant' | 'mode'>,
    ): Promise<void> =>
      forkAction({
        source,
        target,
        grant: options.grant,
        mode: options.mode,
      }).then(emitAnswer),
  );

const storesFamily = program
  .command('stores')
  .description(
    'the live management surface — the wire world: a running server\u2019s stores and their grants',
  );

storesFamily
  .command('create')
  .description('birth a store — 201 serves the name, 409 when it is taken')
  .argument('[name]', 'the new store\u2019s name')
  .action((name: string | undefined): Promise<void> =>
    runWire((binding) => storesCreate(binding, { name })),
  );

storesFamily
  .command('list')
  .description('every open store as a descriptor — the name, the stats')
  .action((): Promise<void> => runWire((binding) => storesList(binding)));

storesFamily
  .command('describe')
  .description('one store\u2019s descriptor — the name, the stats')
  .argument('[name]', 'the store\u2019s name')
  .action((name: string | undefined): Promise<void> =>
    runWire((binding) => storesDescribe(binding, { name })),
  );

storesFamily
  .command('fork')
  .description(
    'fork a store on the wire — born unreached; the birth mint is the offline door\u2019s, remote minting is the grants trio',
  )
  .argument('[source]', 'the store to copy')
  .argument('[target]', 'the child\u2019s name — composed from the source\u2019s name when silent')
  .action((source: string | undefined, target: string | undefined): Promise<void> =>
    runWire((binding) => storesFork(binding, { source, target })),
  );

storesFamily
  .command('delete')
  .description('delete a store — hard and irreversible; reaching this route is the confirmation')
  .argument('[name]', 'the store\u2019s name')
  .action((name: string | undefined): Promise<void> =>
    runWire((binding) => storesDelete(binding, { name })),
  );

const storesGrants = storesFamily
  .command('grants')
  .description(
    'the store grants on the wire — the mint serves its secret exactly once, no TTY gate (the wire door serves programs, #98)',
  );

storesGrants
  .command('mint')
  .description('mint a store grant — the secret served exactly once')
  .argument('[store]', 'the store the grant reaches')
  .argument('[agent]', 'the agent\u2019s label — the request log\u2019s caller axis')
  .argument('[mode]', 'ro or rw')
  .action(
    (
      store: string | undefined,
      agent: string | undefined,
      mode: string | undefined,
    ): Promise<void> => runWire((binding) => storesGrantsMint(binding, { store, agent, mode })),
  );

storesGrants
  .command('list')
  .description('the store\u2019s grant rows — never a secret')
  .argument('[store]', 'the store\u2019s name')
  .action((store: string | undefined): Promise<void> =>
    runWire((binding) => storesGrantsList(binding, { store })),
  );

storesGrants
  .command('revoke')
  .description('revoke a store grant — effective immediately, the file and the live state')
  .argument('[store]', 'the store\u2019s name')
  .argument('[agent]', 'the agent\u2019s label')
  .action((store: string | undefined, agent: string | undefined): Promise<void> =>
    runWire((binding) => storesGrantsRevoke(binding, { store, agent })),
  );

/**
 * The one stdout gesture (#17): exactly one JSON document, then the
 * exit code — written synchronously at fd 1: the parser-error paths
 * end the loop right after the write, and a piped stdout must not lose
 * the verdict on exit. The document's own serialization is guarded: a
 * served tree the serializer refuses is a refusal, not a crash (the
 * souv bin's posture, extended).
 */
function emitAnswer(answer: ConfigAnswer | GrantAnswer | ForkAnswer | AnswerOf): void {
  let line: string;
  try {
    line = `${JSON.stringify(answer.document)}\n`;
  } catch {
    const refusal = refusalOf(
      'the answer does not travel as one JSON document — the serializer refused it',
    );
    writeSync(1, `${JSON.stringify(refusal.document)}\n`);
    process.exitCode = refusal.exitCode;
    return;
  }
  writeSync(1, line);
  process.exitCode = answer.exitCode;
}

/**
 * The wire world's runner: the manager resolves its own binding —
 * the config's host:port and management rows, the env overrides —
 * lazily, inside the action, so `--help` works bindingless. The
 * binding's refusal is the 78 verdict: the manager's config is the
 * binding's own source, a slipped hand teaches.
 */
async function runWire(action: (binding: Binding) => Promise<AnswerOf>): Promise<void> {
  let binding: Binding;
  try {
    binding = resolveManagerBinding(process.env, loadConfig());
  } catch (error) {
    if (error instanceof ConfigError) {
      return emitAnswer({ document: { error: error.message }, exitCode: 78 });
    }
    throw error;
  }
  emitAnswer(await action(binding));
}

/**
 * The parser's own errors ride the one-document contract: `exitOverride`
 * turns commander's exits into throws, and the catch serves the refusal
 * envelope — exit 1, the teaching on stdout. The help and the version
 * already landed their text on stdout before their zero-exit throw; the
 * contract's letter holds there too (text is the door's own shape).
 */
try {
  program.parse();
} catch (error) {
  if (error instanceof CommanderError) {
    if (error.exitCode !== 0) {
      emitAnswer(refusalOf(error.message.replace(/^error: /, '')));
    } else {
      process.exitCode = 0;
    }
  } else {
    throw error;
  }
}
