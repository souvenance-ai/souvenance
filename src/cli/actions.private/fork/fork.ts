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
 * The two gates beside the copy (the GLOSSARY's Fork — born unreached,
 * at every birth): the source passes the shared name grammar before any
 * path is built (a traversal never reaches `existsSync` as a store), and
 * no grant may already name the copy — a token row naming the target
 * survives a vanished store file, so the copy would boot reached by the
 * derelict secret. The composed name dodges those rows by construction
 * (the rows join the occupied set); an explicit target is refused flat,
 * the grant family's own remedy taught.
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
 * authored config never names a file that does not exist — and the
 * grants' state gate stands before the copy, so the copy never lands
 * beside a grant that already names it. The worst mid-gesture death is
 * a child born unreached or a row whose store file is already on disk —
 * and the mint's failure is spoken with the copy's facts beside the
 * refusal (`copy`): the file stood, the document says so.
 */
import { existsSync, rmSync } from 'node:fs';
import {
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
  STORE_NAME_TEACHING,
  isGrantMode,
} from '../../../modules.private/config/mint-doors/mint-doors.ts';
import type { MintedStoreGrant } from '../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import { mintStoreGrant } from '../../../modules.private/config/mint-store-grant/mint-store-grant.ts';
import { Store } from '../../../modules.private/store/store.ts';
import { StoreError } from '../../../modules.private/store/store-error/store-error.ts';
import { composeForkName } from '../../../modules.private/store/utils/compose-fork-name/compose-fork-name.ts';
import { sidecarPaths } from '../../../modules.private/store/utils/sidecar-paths/sidecar-paths.ts';
import { storeDbPath } from '../../../modules.private/server/registry/store-db-path/store-db-path.ts';
import { storeNames } from '../../../modules.private/server/registry/store-names/store-names.ts';
import { missingArg } from '../missing-arg/missing-arg.ts';
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
 * the secret inside it, exactly once. One `{error}` on every refusal —
 * and when the mint refused after the copy stood, the refusal carries
 * the copy's facts beside it (`copy`): the file is on disk, the
 * document says so without the prose.
 */
/** The copy's facts — the success document's body and the mint refusal's rider. */
export interface CopyFacts {
  readonly source: string;
  readonly name: string;
  readonly path: string;
  readonly memories: number;
  readonly edges: number;
}

export type ForkDocument =
  | (CopyFacts & { readonly grant?: BirthGrant })
  | { readonly error: string }
  | { readonly error: string; readonly copy: CopyFacts };

/** What the verb answers: the document and its exit code (0/1/78 per #17). */
export interface ForkAnswer {
  readonly document: ForkDocument;
  readonly exitCode: 0 | 1 | 78;
}

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
  // The dev's ruling's enumeration carries the shape gates in order: the
  // source required, the source's grammar, the target grammar, the mode
  // pairing, the agent grammar, the mode's two words.
  if (missingArg(args.source)) {
    return {
      document: { error: 'the source is required — souvenance fork <source> [target]' },
      exitCode: 1,
    };
  }
  // The shape gates carry the source's own grammar: the path is built
  // after this gate, so a traversal ("../archive") never reaches
  // existsSync as a store — the wedge dies at the name, the shared
  // grammar's voice speaking what the target's gate speaks.
  if (!STORE_NAME.test(args.source)) {
    return { document: { error: STORE_NAME_TEACHING }, exitCode: 1 };
  }
  if (args.target !== undefined && !STORE_NAME.test(args.target)) {
    return { document: { error: STORE_NAME_TEACHING }, exitCode: 1 };
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
    if (missingArg(args.grant)) return { document: { error: AGENT_REQUIRED }, exitCode: 1 };
    if (args.grant === '.' || args.grant === '..') {
      return { document: { error: DOT_AGENT_REFUSAL }, exitCode: 1 };
    }
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
  // The grants' state gate, beside the source's existence: a token row
  // naming an explicit target would ride the copy's boot — a stale row
  // whose store file left the disk is exactly the born-reached hole.
  // The composed name dodges the rows by construction (they join the
  // occupied set below); the explicit target is refused flat, the grant
  // family's remedy taught.
  const holdersTeaching = grantHoldersTeaching(config, args.target);
  if (holdersTeaching !== undefined) {
    return { document: { error: holdersTeaching }, exitCode: 1 };
  }
  // The name resolution under one boundary: the dir scan and the
  // composition are here — the composition's occupied set is the dir's
  // own scan joined with the grants' rows (the shared storeNames unit
  // serves the scan; the registry's cold-open walks the same
  // enumeration; the rows' stores join so the composed child never
  // inherits a grant's stale row — the born-unreached law holds at
  // birth). The 100-bound conflict of the shared rule throws here
  // first: it is caught — the JSON document still answers.
  let name: string;
  try {
    const occupied = new Set<string>([
      ...storeNames(storesDir),
      ...config.tokens.map((row) => row.store),
    ]);
    name = args.target ?? composeForkName(args.source, (candidate) => occupied.has(candidate));
  } catch (error) {
    return { document: { error: (error as Error).message }, exitCode: 1 };
  }
  let opened: Store;
  try {
    // Read-only, always: the fork never writes the parent, an archive
    // forks without waking — and an out-of-date schema refuses with the
    // boot's remedy re-spoken in the manager's voice below.
    opened = Store.open({ dbPath: sourcePath, readOnly: true });
  } catch (error) {
    // The typed refusal keeps its teaching; anything the store did not
    // type (a corrupt file's SQLITE_NOTADB, an open the OS refused)
    // is the CLI's json-first bug net: one `{error}`, exit 1, no
    // rejection past the await.
    if (error instanceof StoreError) {
      return { document: { error: openTeaching(error, sourcePath) }, exitCode: 1 };
    }
    return { document: { error: (error as Error).message }, exitCode: 1 };
  }
  const targetPath = storeDbPath(storesDir, name);
  // The copy's pre-answer, recorded before the attempt (the registry's
  // #claim shape): a target pre-existing the copy is the operator's —
  // its fate never ours — and the store's own conflict guard speaks for
  // it at the copy's gate.
  const handed = existsSync(targetPath);
  try {
    const result = opened.fork(targetPath);
    const grant =
      args.grant === undefined
        ? undefined
        : birthGrant(config, door, args.grant, args.mode ?? 'rw', name);
    if (grant !== undefined && 'error' in grant) {
      // The mint refused with the copy already on disk: the refusal
      // carries the copy's facts, so the operator knows the file stood
      // in the same document that says the grant did not land — one
      // truth, no prose.
      return {
        document: {
          error: grant.error,
          copy: {
            source: args.source,
            name,
            path: result.path,
            memories: result.memories,
            edges: result.edges,
          },
        },
        exitCode: 1,
      };
    }
    // The optional grant assembles in the branch: a birth's facts ride
    // the copy's, a plain fork serves the facts alone.
    const document: ForkDocument = {
      source: args.source,
      name,
      path: result.path,
      memories: result.memories,
      edges: result.edges,
      ...(grant !== undefined ? { grant } : {}),
    };
    return { document, exitCode: 0 };
  } catch (error) {
    // The failed-claim law (the registry's #claim, the same sidecar
    // trio): a copy that died keeps to its OWN artifacts — when the
    // target pre-existed the attempt, nothing goes (the file the
    // attempt met is the operator's; the store's conflict voice names
    // that file its own), and when it was born here, the db and its
    // sidecars go — a half-born store must not cold-open at the next
    // boot, nor make the name a retry's collision. The completed-copy
    // cases never reach the catch: a mint's failure returns inside the
    // try, the copy standing.
    if (
      !handed &&
      !(error instanceof StoreError && error.message.startsWith(TARGET_EXISTS_PREFIX))
    ) {
      for (const path of sidecarPaths(targetPath)) {
        rmSync(path, { force: true });
      }
    }
    // The copy's typed refusal keeps its re-speaks (the conflict, no
    // pass-force clause); a native failure (an unwritable target's
    // SQLITE_CANTOPEN, a full disk) is the same json-first net as the
    // open's: one `{error}`, exit 1, the await always settled.
    if (error instanceof StoreError) {
      return { document: { error: forkTeaching(error) }, exitCode: 1 };
    }
    return { document: { error: (error as Error).message }, exitCode: 1 };
  } finally {
    opened.close();
  }
}

/**
 * The grants' state gate's refusal voice (the born-reached hole): the
 * copy would boot next to a row that already names it — the derelict
 * secret reaches it at the next wake. The remedy is the grant family's
 * own surgery, named in the umbrella form (one command per agent).
 */
function grantHoldersTeaching(config: Config, target: string | undefined): string | undefined {
  if (target === undefined) return undefined;
  const agents = config.tokens.filter((row) => row.store === target).map((row) => row.agent);
  if (agents.length === 0) return undefined;
  const label = agents.map((agent) => `"${agent}"`).join(', ');
  const noun = agents.length === 1 ? 'agent' : 'agents';
  return (
    `fork target "${target}" already holds a store grant (${noun} ${label}) — ` +
    `a copy would be born reached; revoke it first: souvenance grant store remove <agent> <store>`
  );
}

/**
 * The birth mint: the store family's own mint and config authoring (the
 * chain). Every mint failure returns the error result — the pair-only
 * check of the mint's typed surface, the broken generator's plain
 * refusal, anything the mint's own call threw — with the completed
 * copy's facts riding the caller's `{error, copy}` branch: the child is
 * born unreached in every failure path, the principle holds at every
 * seam. (The pair's early refusal lives upstream — the grants' state
 * gate refuses an explicit target named by any row; the composed name
 * dodges the rows by construction.) The authoring's failures already
 * returned; nothing is rethrown past the copy.
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
    return { error: (error as Error).message };
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
