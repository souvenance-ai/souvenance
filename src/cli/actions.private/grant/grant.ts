/**
 * The `grant` family (the manager CLI's third slice, #48): the two
 * credential families as the manager's offline hands on the file. The
 * pinned shape (the grilling, 2026-11-07, with the 2026-11-08 rulings):
 * `grant store add|list|reveal|remove` and `grant management
 * add|list|reveal|remove`. While the server runs, the live credential
 * state is the server's (ADR 0009): the WRITING verbs probe the
 * configured `/healthz` and refuse politely — teaching the wire door
 * for the store family (the trio #98 serves), the host-local truth for
 * the management family (the wire never mints management rows, the
 * host's hands own who manages); the READING verbs read the file — its
 * credential rows are the running server's echo, and reveal has no
 * other door (the wire never serves a secret). With no server running
 * the manager owns the config, and add/remove speak the same pure mint
 * and revoke as the wire — the config module is the shared home (#98).
 *
 * The secret never crosses a pipe: `add` and `reveal` serve it on a TTY
 * alone, and `add` refuses BEFORE the mint — a piped mint is a script's
 * mistake; the row does not exist for a secret the only door refuses to
 * show. `list` never serves secrets. The offline mints refuse the
 * dot-segment agents at the door (`.`/`..` — the wire's revoke URL could
 * never address them) as the wire's own mint door does; the config
 * grammar stays untouched for hand-authored rows. A malformed file
 * refuses with exit 78 like the config family; every other refusal is
 * one `{error}` document and exit 1; the action answers, cli.ts prints
 * and exits.
 */
import {
  ConfigError,
  type Config,
  STORE_NAME,
  defaultConfigPath,
  loadConfig,
} from '../../../modules.private/config/config.ts';
import { authorCredentials } from '../../../modules.private/config/author-credentials/author-credentials.ts';
import type { MintedManagementGrant } from '../../../modules.private/config/mint-management-grant/mint-management-grant.ts';
import { mintManagementGrant } from '../../../modules.private/config/mint-management-grant/mint-management-grant.ts';
import type { MintedStoreGrant } from '../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import { mintStoreGrant } from '../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import { withoutManagementGrant } from '../../../modules.private/config/without-management-grant/without-management-grant.ts';
import { withoutStoreGrant } from '../../../modules.private/config/without-store-grant/without-store-grant.ts';
import { probeLiveness } from '../liveness-probe/liveness-probe.ts';

/** The two credential families as the CLI speaks them (#63, the GLOSSARY's Grant). */
export type GrantCommand =
  | 'store add'
  | 'store list'
  | 'store reveal'
  | 'store remove'
  | 'management add'
  | 'management list'
  | 'management reveal'
  | 'management remove';

/** The raw arguments the bin parsed — validation lives in the action. */
export interface GrantArgs {
  readonly agent?: string;
  readonly store?: string;
  /** The mode at its raw width — `ro` and `rw` only, refused otherwise. */
  readonly mode?: string;
}

/**
 * The door's seams, opened for the tests: the config file's path, the
 * liveness answer, the TTY verdict. Defaults speak reality — the one
 * home path, the real probe over the resolved config, stdout's own
 * TTY-ness.
 */
export interface GrantDoor {
  readonly configPath?: string;
  readonly liveness?: () => Promise<boolean>;
  readonly tty?: boolean;
}

/** A store grant row as `list` serves it — the secret is never on it. */
export interface GrantRow {
  readonly agent: string;
  readonly store: string;
  readonly mode: 'ro' | 'rw';
}

/** A management row as `list` serves it — the secret is never on it. */
export interface ManagementRow {
  readonly agent: string;
}

/**
 * The one JSON document each grant verb serves on stdout (#17). The
 * rows that carry a secret (`add`, `reveal`) are the TTY-only ones —
 * an `add` piped is refused before the mint and never renders here.
 */
export type GrantDocument =
  | {
      readonly agent: string;
      readonly store: string;
      readonly mode: 'ro' | 'rw';
      readonly secret: string;
    }
  | { readonly grants: readonly GrantRow[] }
  | { readonly agent: string; readonly store: string; readonly revoked: true }
  | { readonly agent: string; readonly secret: string }
  | { readonly grants: readonly ManagementRow[] }
  | { readonly agent: string; readonly revoked: true }
  | { readonly error: string };

/**
 * What every grant verb answers: the document and its exit code. 0 =
 * served; 1 = refused by the family's own verdicts (the running
 * server, a piped secret, an unknown pair, a duplicate, a write that
 * failed); 78 = the config refused (#17's configuration exit).
 */
export interface GrantAnswer {
  readonly document: GrantDocument;
  readonly exitCode: 0 | 1 | 78;
}

/** The one TTY refusal, spoken at both doors that serve a secret (#48 ruling 3). */
const PIPED_TEACHING =
  'the secret never crosses a pipe — run it in a terminal, where stdout is a TTY';

/** The agent's one teaching, composed at the two mint doors. */
const AGENT_REQUIRED =
  'the agent\u2019s label is required — the request log\u2019s caller axis; per-terminal labels are preferred';

/** The dot-segment refusal at the offline mint's door — the wire mint's own words. */
const DOT_AGENT_REFUSAL =
  '"." and ".." refuse — the wire\u2019s revoke URL (/stores/{name}/grants/{agent}) ' +
  'could never address the grant: take a label it can carry';

/** The mode's grammar, taught where a wrong one arrives. */
const MODE_TEACHING =
  'the mode is ro or rw — read only, or read and write; changing it is revoke, then mint';

/**
 * The running-server refusal, store voice: the wire door exists — the
 * trio on the management surface, a management grant as the Bearer.
 */
function runningStoreTeaching(config: Config): string {
  return (
    `the live credential state is the running server's (a ${config.host}:${config.port}) — ` +
    `mint and revoke the store family on the wire: POST/GET/DELETE /stores/{name}/grants\u2026, ` +
    `a management grant as the Bearer; the manager\u2019s local credential writes refuse while the server runs`
  );
}

/**
 * The running-server refusal, management voice: no wire door and that
 * is by design — hand edits remain restart-to-apply, the down window
 * is the manager's own.
 */
function runningManagementTeaching(config: Config): string {
  return (
    `the live credential state is the running server's (a ${config.host}:${config.port}) — ` +
    `the management family has no wire door: the wire never mints management rows, ` +
    `the host\u2019s hands own who manages. Hand-edit the file and restart to apply, or return ` +
    `with the server down`
  );
}

export async function grantAction(
  command: GrantCommand,
  args: GrantArgs,
  door: GrantDoor = {},
): Promise<GrantAnswer> {
  // The secret's doors go first: a piped add or reveal refuses before
  // anything else — no mint, no read worth naming.
  if (servesSecret(command) && !(door.tty ?? process.stdout.isTTY === true)) {
    return { document: { error: PIPED_TEACHING }, exitCode: 1 };
  }
  const file = door.configPath ?? defaultConfigPath();
  let config: Config;
  try {
    config = loadConfig(file);
  } catch (error) {
    return { document: { error: (error as Error).message }, exitCode: 78 };
  }
  const serverRunning = await (door.liveness ?? (() => probeLiveness(config)))();
  if (command === 'store add') return storeAdd(config, args, file, serverRunning);
  if (command === 'store remove') return storeRemove(config, args, file, serverRunning);
  if (command === 'management add') return managementAdd(config, args, file, serverRunning);
  if (command === 'management remove') return managementRemove(config, args, file, serverRunning);
  // The reads probe nothing (the file rows are the running server's
  // echo); they only need the args their verb demands.
  if (command === 'store list') {
    return {
      document: {
        grants: config.tokens.map((row) => ({
          agent: row.agent,
          store: row.store,
          mode: row.mode,
        })),
      },
      exitCode: 0,
    };
  }
  if (command === 'management list') {
    return {
      document: { grants: config.management.map((row) => ({ agent: row.agent })) },
      exitCode: 0,
    };
  }
  if (command === 'store reveal') return revealStoreRow(config, args);
  return revealManagementRow(config, args);
}

/** The two doors that carry a secret — both TTY-only (#48 ruling 3). */
function servesSecret(command: GrantCommand): boolean {
  return (
    command === 'store add' ||
    command === 'store reveal' ||
    command === 'management add' ||
    command === 'management reveal'
  );
}

async function storeAdd(
  config: Config,
  args: GrantArgs,
  file: string,
  serverRunning: boolean,
): Promise<GrantAnswer> {
  if (serverRunning) return { document: { error: runningStoreTeaching(config) }, exitCode: 1 };
  if (missing(args.agent)) return { document: { error: AGENT_REQUIRED }, exitCode: 1 };
  if (args.agent === '.' || args.agent === '..') {
    return { document: { error: DOT_AGENT_REFUSAL }, exitCode: 1 };
  }
  if (missing(args.store)) {
    return {
      document: { error: 'the store is required — grant store add <agent> <store> <mode>' },
      exitCode: 1,
    };
  }
  if (!STORE_NAME.test(args.store)) {
    return {
      document: {
        error:
          'the store name breaks the grammar — lowercase, starts with a letter, up to 32 characters (a-z, 0-9, dashes)',
      },
      exitCode: 1,
    };
  }
  if (!isGrantMode(args.mode)) {
    return { document: { error: MODE_TEACHING }, exitCode: 1 };
  }
  let minted: MintedStoreGrant;
  try {
    minted = mintStoreGrant(config, { agent: args.agent, store: args.store, mode: args.mode });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return { document: { error: error.message }, exitCode: 1 };
  }
  try {
    authorCredentials(file, config, minted.next, 'the mint');
  } catch (error) {
    return { document: { error: (error as Error).message }, exitCode: 1 };
  }
  return {
    document: {
      agent: minted.grant.agent,
      store: minted.grant.store,
      mode: minted.grant.mode,
      secret: minted.grant.secret,
    },
    exitCode: 0,
  };
}

async function storeRemove(
  config: Config,
  args: GrantArgs,
  file: string,
  serverRunning: boolean,
): Promise<GrantAnswer> {
  if (serverRunning) return { document: { error: runningStoreTeaching(config) }, exitCode: 1 };
  if (missing(args.agent) || missing(args.store)) {
    return {
      document: {
        error: 'the agent and the store are required — grant store remove <agent> <store>',
      },
      exitCode: 1,
    };
  }
  const removed = withoutStoreGrant(config, { agent: args.agent, store: args.store });
  if (removed.count === 0) {
    return { document: { error: `no grant for "${args.agent}" on "${args.store}"` }, exitCode: 1 };
  }
  try {
    authorCredentials(file, config, removed.next, 'the revocation');
  } catch (error) {
    return { document: { error: (error as Error).message }, exitCode: 1 };
  }
  return { document: { agent: args.agent, store: args.store, revoked: true }, exitCode: 0 };
}

async function managementAdd(
  config: Config,
  args: GrantArgs,
  file: string,
  serverRunning: boolean,
): Promise<GrantAnswer> {
  if (serverRunning) return { document: { error: runningManagementTeaching(config) }, exitCode: 1 };
  if (missing(args.agent)) return { document: { error: AGENT_REQUIRED }, exitCode: 1 };
  if (args.agent === '.' || args.agent === '..') {
    return { document: { error: DOT_AGENT_REFUSAL }, exitCode: 1 };
  }
  let minted: MintedManagementGrant;
  try {
    minted = mintManagementGrant(config, { agent: args.agent });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return { document: { error: error.message }, exitCode: 1 };
  }
  try {
    authorCredentials(file, config, minted.next, 'the mint');
  } catch (error) {
    return { document: { error: (error as Error).message }, exitCode: 1 };
  }
  return {
    document: { agent: minted.grant.agent, secret: minted.grant.secret },
    exitCode: 0,
  };
}

async function managementRemove(
  config: Config,
  args: GrantArgs,
  file: string,
  serverRunning: boolean,
): Promise<GrantAnswer> {
  if (serverRunning) return { document: { error: runningManagementTeaching(config) }, exitCode: 1 };
  if (missing(args.agent)) {
    return {
      document: { error: 'the agent is required — grant management remove <agent>' },
      exitCode: 1,
    };
  }
  const removed = withoutManagementGrant(config, { agent: args.agent });
  if (removed.count === 0) {
    return { document: { error: `no management row for "${args.agent}"` }, exitCode: 1 };
  }
  try {
    authorCredentials(file, config, removed.next, 'the revocation');
  } catch (error) {
    return { document: { error: (error as Error).message }, exitCode: 1 };
  }
  return { document: { agent: args.agent, revoked: true }, exitCode: 0 };
}

function revealStoreRow(config: Config, args: GrantArgs): GrantAnswer {
  if (missing(args.agent) || missing(args.store)) {
    return {
      document: {
        error: 'the agent and the store are required — grant store reveal <agent> <store>',
      },
      exitCode: 1,
    };
  }
  const row = config.tokens.find(
    (grant) => grant.agent === args.agent && grant.store === args.store,
  );
  if (row === undefined) {
    return { document: { error: `no grant for "${args.agent}" on "${args.store}"` }, exitCode: 1 };
  }
  return {
    document: { agent: row.agent, store: row.store, mode: row.mode, secret: row.secret },
    exitCode: 0,
  };
}

function revealManagementRow(config: Config, args: GrantArgs): GrantAnswer {
  if (missing(args.agent)) {
    return {
      document: { error: 'the agent is required — grant management reveal <agent>' },
      exitCode: 1,
    };
  }
  // First match — the same resolution the boot holds (#74's
  // resolveBearer posture); the grammar allows a duplicated agent, the
  // reveal serves the row the running state resolves. No new policy.
  const row = config.management.find((grant) => grant.agent === args.agent);
  if (row === undefined) {
    return { document: { error: `no management row for "${args.agent}"` }, exitCode: 1 };
  }
  return { document: { agent: row.agent, secret: row.secret }, exitCode: 0 };
}

/** The mode's two words, and nothing else — the narrowing the mint's type demands. */
function isGrantMode(value: string | undefined): value is 'ro' | 'rw' {
  return value === 'ro' || value === 'rw';
}

/**
 * True when absent — the guard's negative branch narrows the raw arg to
 * a string the downstream typed shapes demand.
 */
function missing(value: string | undefined): value is undefined {
  return value === undefined || value.length === 0;
}
