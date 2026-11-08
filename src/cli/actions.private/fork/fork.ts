/**
 * The `fork` action (the manager CLI's fourth slice, #48): the offline
 * birth gesture. The store's own fork is the copy primitive (VACUUM
 * INTO — safe under concurrent WAL writers, compacted, FTS included,
 * never a write to the parent) and the manager opens the source
 * READ-ONLY: an archive forks without waking, and an out-of-date schema
 * refuses with the boot's remedy — the migration is the boot's
 * business, the fork never mutates the source as a side effect. While
 * the server runs, the fork refuses and teaches the wire door
 * (`POST /stores/{name}/fork`, a management grant as the Bearer) — the
 * offline surgery lives in the down window alone.
 *
 * The target: grammar-checked when given, the collision refused by the
 * store's own copy — and the CLI re-speaks that refusal without the
 * store's "(pass force to overwrite)" clause: the manager never
 * overwrites a store's file, the wire's 409 is the posture. Absent: the
 * shared composition rule names the child (`<source>-fork`, `-fork-2`,
 * … — the store/utils unit, the dir scan as the occupied set here, the
 * registry's open map on the wire).
 *
 * The birth mint (the dev's ruling, 2026-11-08): `--grant <agent>`
 * chains the child's first grant into the same gesture — copy, then the
 * store family's own mint and config authoring, the secret served
 * exactly once on a TTY (a piped birth refuses before anything is
 * written). Opt-in, never always-on: the backup and the examine copy
 * are born unreached (the GLOSSARY's Fork — the chain is an explicit
 * mint, never an inheritance), the mint needs the agent's real label
 * (the request log's caller axis), and a scriptable fork stays piped.
 * `--mode <ro|rw>` rides the chain (default `rw` — the child becomes
 * themselves); a mode without the grant refuses. The order is
 * load-bearing: the copy lands before the row is authored, so the
 * authored config never names a file that does not exist — the worst
 * mid-gesture death is a child born unreached or a row whose store
 * file is already on disk.
 */
import { existsSync, readdirSync } from 'node:fs';
import {
  ConfigError,
  type Config,
  STORE_NAME,
  defaultConfigPath,
  loadConfig,
} from '../../../modules.private/config/config.ts';
import { authorCredentials } from '../../../modules.private/config/author-credentials/author-credentials.ts';
import {
  AGENT_REQUIRED,
  DOT_AGENT_REFUSAL,
  MODE_TEACHING,
  PIPED_TEACHING,
  isGrantMode,
} from '../../../modules.private/config/mint-doors/mint-doors.ts';
import type { MintedStoreGrant } from '../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import { mintStoreGrant } from '../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import { Store } from '../../../modules.private/store/store.ts';
import { StoreError } from '../../../modules.private/store/store-error/store-error.ts';
import { composeForkName } from '../../../modules.private/store/utils/compose-fork-name/compose-fork-name.ts';
import { storeDbPath } from '../../../modules.private/server/registry/store-db-path/store-db-path.ts';
import { probeLiveness } from '../liveness-probe/liveness-probe.ts';

/** The raw arguments the bin parsed — validation lives in the action. */
export interface ForkArgs {
  readonly source?: string;
  readonly target?: string;
  /** The birth grant's agent — present means the chain (the opt-in birth mint). */
  readonly grant?: string;
  /** The birth grant's mode at raw width; the grammar gates it, `rw` is the default. */
  readonly mode?: string;
}

/** The door's seams, opened for the tests. Defaults speak reality. */
export interface ForkDoor {
  readonly configPath?: string;
  readonly liveness?: () => Promise<boolean>;
  /** The TTY verdict — only the birth mint serves a secret. */
  readonly tty?: boolean;
}

/** The birth grant as the chained success serves it — the secret inside, exactly once. */
export interface BirthGrant {
  readonly agent: string;
  readonly store: string;
  readonly mode: 'ro' | 'rw';
  readonly secret: string;
}

/**
 * The one JSON document the verb serves on stdout (#17): the copy's
 * facts (the source, the child's name, the file's real path, the row
 * counts) — and the birth grant's facts beside them when the chain ran,
 * the secret inside it, exactly once. One `{error}` on every refusal.
 */
export type ForkDocument =
  | {
      readonly source: string;
      readonly name: string;
      readonly path: string;
      readonly memories: number;
      readonly edges: number;
    }
  | {
      readonly source: string;
      readonly name: string;
      readonly path: string;
      readonly memories: number;
      readonly edges: number;
      readonly grant: BirthGrant;
    }
  | { readonly error: string };

/** What the verb answers: the document and its exit code (0/1/78 per #17). */
export interface ForkAnswer {
  readonly document: ForkDocument;
  readonly exitCode: 0 | 1 | 78;
}

/** The store name's teaching at the target's door — the grant slice's own words. */
const STORE_NAME_TEACHING =
  'the store name breaks the grammar — lowercase, starts with a letter, up to 32 characters (a-z, 0-9, dashes)';

/**
 * The running-server refusal, fork voice: the wire door (the
 * management surface's fork) exists, and a management grant bears it.
 */
function runningTeaching(config: Config): string {
  return (
    `the server owns the stores (a ${config.host}:${config.port}) — fork on the wire: ` +
    `POST /stores/{name}/fork with a management grant as the Bearer; ` +
    `the manager’s offline surgery refuses while the server runs`
  );
}

/**
 * The copy's conflict, re-speaked: the store's "pass force to
 * overwrite" clause never crosses — the manager never overwrites a
 * store's file, the wire's 409 is the posture.
 */
const TARGET_EXISTS_PREFIX = 'fork target already exists: ';

export async function forkAction(args: ForkArgs, door: ForkDoor = {}): Promise<ForkAnswer> {
  // The birth's secret goes first: a piped chain refuses before
  // anything is written — no copy, no row, the file as it was.
  if (args.grant !== undefined && !(door.tty ?? process.stdout.isTTY === true)) {
    return { document: { error: PIPED_TEACHING }, exitCode: 1 };
  }
  let config: Config;
  try {
    config = loadConfig(door.configPath ?? defaultConfigPath());
  } catch (error) {
    return { document: { error: (error as Error).message }, exitCode: 78 };
  }
  const liveness = door.liveness ?? (() => probeLiveness(config));
  if (await liveness()) {
    return { document: { error: runningTeaching(config) }, exitCode: 1 };
  }
  if (missing(args.source)) {
    return {
      document: { error: 'the source is required — souvenance fork <source> [target]' },
      exitCode: 1,
    };
  }
  if (args.mode !== undefined && args.grant === undefined) {
    return {
      document: {
        error: 'the mode pairs with --grant — the birth’s mint rides the chain or not at all',
      },
      exitCode: 1,
    };
  }
  if (args.grant !== undefined) {
    if (missing(args.grant)) return { document: { error: AGENT_REQUIRED }, exitCode: 1 };
    if (args.grant === '.' || args.grant === '..') {
      return { document: { error: DOT_AGENT_REFUSAL }, exitCode: 1 };
    }
  }
  if (args.target !== undefined && !STORE_NAME.test(args.target)) {
    return { document: { error: STORE_NAME_TEACHING }, exitCode: 1 };
  }
  if (args.mode !== undefined && !isGrantMode(args.mode)) {
    return { document: { error: MODE_TEACHING }, exitCode: 1 };
  }
  const storesDir = config.storesDir;
  const sourcePath = storeDbPath(storesDir, args.source);
  if (!existsSync(sourcePath)) {
    return {
      document: { error: `no store "${args.source}" in the registry at ${storesDir}` },
      exitCode: 1,
    };
  }
  // The composition's occupied set is the dir's own scan — the registry
  // enumerates the same way (every `*.db` there is a store); one scan,
  // one predicate, the shared rule decides.
  const occupied = scanStoreNames(storesDir);
  const name = args.target ?? composeForkName(args.source, (candidate) => occupied.has(candidate));
  let opened: Store;
  try {
    // Read-only, always: the fork never writes the parent, an archive
    // forks without waking — and an out-of-date schema refuses with the
    // boot's remedy re-spoken in the manager's voice below.
    opened = Store.open({ dbPath: sourcePath, readOnly: true });
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    return { document: { error: openTeaching(error, sourcePath) }, exitCode: 1 };
  }
  try {
    const result = opened.fork(storeDbPath(storesDir, name));
    const grant =
      args.grant === undefined
        ? undefined
        : birthGrant(config, door, args.grant, args.mode ?? 'rw', name);
    if (grant !== undefined) {
      if ('error' in grant) return { document: { error: grant.error }, exitCode: 1 };
      return {
        document: {
          source: args.source,
          name,
          path: result.path,
          memories: result.memories,
          edges: result.edges,
          grant,
        },
        exitCode: 0,
      };
    }
    return {
      document: {
        source: args.source,
        name,
        path: result.path,
        memories: result.memories,
        edges: result.edges,
      },
      exitCode: 0,
    };
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    return { document: { error: forkTeaching(error) }, exitCode: 1 };
  } finally {
    opened.close();
  }
}

/**
 * The birth mint: the store family's own mint and config authoring (the
 * chain). The grant's only refusals here are the config's — the pair
 * (agent, child) exists already, or the authoring refused — and the
 * either/return carries them with the copy standing: the child is born
 * unreached in the failure path, the principle holds at every seam.
 */
function birthGrant(
  config: Config,
  door: ForkDoor,
  agent: string,
  mode: 'ro' | 'rw',
  name: string,
): BirthGrant | { readonly error: string } {
  let minted: MintedStoreGrant;
  try {
    minted = mintStoreGrant(config, { agent, store: name, mode });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return { error: error.message };
  }
  try {
    authorCredentials(door.configPath ?? defaultConfigPath(), config, minted.next, 'the mint');
  } catch (error) {
    return { error: (error as Error).message };
  }
  return {
    agent: minted.grant.agent,
    store: minted.grant.store,
    mode: minted.grant.mode,
    secret: minted.grant.secret,
  };
}

/** The open refusal's manager voice: the schema's out-of-date clause carries the boot's remedy. */
function openTeaching(error: StoreError, sourcePath: string): string {
  const version = error.message.match(
    /^store at .* is at schema version (\d+) \(the library expects (\d+)\)/,
  );
  if (version !== null) {
    return (
      `store at ${sourcePath} is at schema version ${version[1]}` +
      ` (the library expects ${version[2]}) — boot the server once to migrate, then fork`
    );
  }
  return error.message;
}

function forkTeaching(error: StoreError): string {
  if (error.message.startsWith(TARGET_EXISTS_PREFIX)) {
    return `${error.message.split(' (pass')[0]} — the manager never overwrites; name another store, or remove the existing one`;
  }
  return error.message;
}

/** The dir scan's one shape: the registry's own filter, the names without their `.db`. */
function scanStoreNames(storesDir: string): Set<string> {
  const names = new Set<string>();
  for (const entry of readdirSync(storesDir)) {
    if (entry.endsWith('.db')) names.add(entry.slice(0, -3));
  }
  return names;
}

function missing(value: string | undefined): value is undefined {
  return value === undefined || value.length === 0;
}
