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
 * The offline store mint also mirrors the boot's own validation (the
 * serve.ts:72-84 boot refuses any tokens[] row whose store the registry
 * does not open; the wire's mint door 404s the same names): a mint for
 * a store absent from the resolved stores dir refuses before the row.
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
import { existsSync } from 'node:fs';
import {
  ConfigError,
  type Config,
  STORE_NAME,
  defaultConfigPath,
  loadConfig,
} from '../../../../modules.private/config/config.ts';
import { authorCredentials } from '../../../../modules.private/config/author-credentials/author-credentials.ts';
import type { MintedManagementGrant } from '../../../../modules.private/config/mint-management-grant/mint-management-grant.ts';
import { mintManagementGrant } from '../../../../modules.private/config/mint-management-grant/mint-management-grant.ts';
import type { MintedStoreGrant } from '../../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import { mintStoreGrant } from '../../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import {
  AGENT_REQUIRED,
  DOT_AGENT_REFUSAL,
  MODE_TEACHING,
  PIPED_TEACHING,
  STORE_NAME_TEACHING,
  isGrantMode,
} from '../../../../modules.private/config/mint-doors/mint-doors.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import { storeDbPath } from '../../../../modules.private/server/registry/store-db-path/store-db-path.ts';
import { withoutManagementGrant } from '../../../../modules.private/config/without-management-grant/without-management-grant.ts';
import { withoutStoreGrant } from '../../../../modules.private/config/without-store-grant/without-store-grant.ts';
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
 * stores dir the store-existence probe consults, the liveness answer,
 * the TTY verdict. Defaults speak reality — the one home path, the
 * resolved config's stores dir, the real probe over the resolved
 * config, stdout's own TTY-ness.
 */
export interface GrantDoor {
  readonly configPath?: string;
  readonly storesDir?: string;
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

/**
 * The running-server refusal, store voice: the wire door exists — the
 * trio on the management surface, a management grant as the Bearer.
 */
function runningStoreTeaching(config: Config): string {
  return (
    `the live credential state is the running server's (a ${config.host}:${config.port}) — ` +
    `mint and revoke the store family on the wire: POST/GET/DELETE /stores/{name}/grants\u2026, ` +
    `a management grant as the Bearer; the manager’s local credential writes refuse while the server runs`
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
    `the host’s hands own who manages. Hand-edit the file and restart to apply, or return ` +
    `with the server down`
  );
}

/**
 * The absent-store refusal at the offline mint's door — the boot's own
 * gate taught before the write. The serve.ts:72-84 boot refuses to
 * start on any tokens[] row whose store the registry does not open, and
 * the wire's mint door 404s the same names (grants.ts): minting one
 * offline would persist exactly that boot-damning row — a grant able
 * only to serve 404s forever. The remedy is ADR 0006's ceremony, the
 * wire named and no more (the manager's own birth verb is a later
 * slice): the store is born over HTTP, then the grant is minted.
 */
function absentStoreTeaching(config: Config, agent: string, store: string): string {
  return (
    `"${store}" (${agent}) names no store the registry has at ${config.storesDir} — ` +
    `the boot refuses to start on such a token row and the wire's mint refuses it with a 404: ` +
    `birth the store first on the wire (POST /stores, a management grant as the Bearer), then mint`
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
  const liveness = door.liveness ?? (() => probeLiveness(config));
  const storesDir = door.storesDir ?? config.storesDir;
  // The dispatcher is exhaustive: reads never probe — the file rows are
  // the running server's echo; only the writes ask who holds the state.
  switch (command) {
    case 'store add':
      return storeAdd(config, args, file, storesDir, liveness);
    case 'store remove':
      return storeRemove(config, args, file, liveness);
    case 'management add':
      return managementAdd(config, args, file, liveness);
    case 'management remove':
      return managementRemove(config, args, file, liveness);
    case 'store list':
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
    case 'management list':
      return {
        document: { grants: config.management.map((row) => ({ agent: row.agent })) },
        exitCode: 0,
      };
    case 'store reveal':
      return revealStoreRow(config, args);
    case 'management reveal':
      return revealManagementRow(config, args);
    default:
      return assertUnwired(command);
  }
}

/**
 * The dispatcher's net for a verb nobody wired: the switch's default
 * receives a never only when every union member has its case — a new
 * verb missing its branch never compiles past here.
 */
function assertUnwired(command: never): never {
  throw new Error(`the grant command "${command}" has no branch on the dispatcher`);
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
  storesDir: string,
  liveness: () => Promise<boolean>,
): Promise<GrantAnswer> {
  if (await liveness()) return { document: { error: runningStoreTeaching(config) }, exitCode: 1 };
  if (missingArg(args.agent)) return { document: { error: AGENT_REQUIRED }, exitCode: 1 };
  if (args.agent === '.' || args.agent === '..') {
    return { document: { error: DOT_AGENT_REFUSAL }, exitCode: 1 };
  }
  if (missingArg(args.store)) {
    return {
      document: { error: 'the store is required — grant store add <agent> <store> <mode>' },
      exitCode: 1,
    };
  }
  if (!STORE_NAME.test(args.store)) {
    return {
      document: {
        error: STORE_NAME_TEACHING,
      },
      exitCode: 1,
    };
  }
  if (!isGrantMode(args.mode)) {
    return { document: { error: MODE_TEACHING }, exitCode: 1 };
  }
  // The boot's own gate, taught offline (serve.ts:72-84): the registry
  // enumerates the stores dir — every `<name>.db` there is a store, no
  // list beside it to drift — so the mirror is the file's existence
  // alone. No database is opened, no lock claimed: the manager is not
  // the owner while probing. The grammar gate above already refused the
  // names the registry itself would fail the boot on.
  if (!existsSync(storeDbPath(storesDir, args.store))) {
    return {
      document: { error: absentStoreTeaching(config, args.agent, args.store) },
      exitCode: 1,
    };
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
  liveness: () => Promise<boolean>,
): Promise<GrantAnswer> {
  if (await liveness()) return { document: { error: runningStoreTeaching(config) }, exitCode: 1 };
  if (missingArg(args.agent) || missingArg(args.store)) {
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
  liveness: () => Promise<boolean>,
): Promise<GrantAnswer> {
  if (await liveness()) {
    return { document: { error: runningManagementTeaching(config) }, exitCode: 1 };
  }
  if (missingArg(args.agent)) return { document: { error: AGENT_REQUIRED }, exitCode: 1 };
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
  liveness: () => Promise<boolean>,
): Promise<GrantAnswer> {
  if (await liveness()) {
    return { document: { error: runningManagementTeaching(config) }, exitCode: 1 };
  }
  if (missingArg(args.agent)) {
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
  if (missingArg(args.agent) || missingArg(args.store)) {
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
  if (missingArg(args.agent)) {
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
