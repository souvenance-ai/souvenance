/**
 * The credential surgery on the one config file (#98, ADR 0009): the
 * wire mints and revokes by authoring the config — the row whose secret
 * the response serves exactly once, or the rows a revocation removes.
 * The file is re-read raw, the two credential keys are spliced from the
 * caller's `next` state, every sibling key rides verbatim (the
 * operator's hand on `port`, `host`, `storesDir`, `logRequests` stays
 * untouched — hand edits there remain restart-to-apply), the result
 * faces the full grammar (a write that would brick the next boot
 * refuses instead), and the write itself is the ownership lock's claim
 * shape: fully written to a scratch name created 0600 (an existing
 * looser file is tightened on sight — the guarded-rig map's flight),
 * fsynced, then renamed over the config.
 *
 * The drift rule (the dev's, 2026-11-07): while the server runs, the
 * live credential state is the server's; the file's credential rows are
 * its echo. `expected` is the live state the callers stage from — a file
 * whose rows disagree with it is a hand edit made while running, and the
 * surgery refuses rather than silently re-authoring: external hand edits
 * remain restart-to-apply, never erased by a mint in flight. The
 * missing file with empty expected families is the one honest creation:
 * a cold host's first grant, written at 0600 from nothing.
 *
 * Refusals throw ConfigError and touch nothing — the running state and
 * the file both survive every refusal. The message may name the path
 * (the operator's own knowledge, the CLI's `config file` serves it);
 * it never quotes the file's raw text (a config can carry a secret).
 */
import {
  mkdirSync,
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { ConfigError, parseConfig, type CredentialFamilies } from '../config.ts';

/** The drift refusal: the file's rows are not the live state's echo. */
export class CredentialDriftError extends ConfigError {}

/**
 * Reads the file's credential rows, canonically. Absent keys are the
 * empty family (the boot resolves the same); a hand-mangled shape is
 * merely not equal to the live rows — the drift rule speaks, no guess.
 */
function fileRows(raw: unknown): { tokens: readonly unknown[]; management: readonly unknown[] } {
  const doc = raw as Record<string, unknown> | null;
  return {
    tokens: Array.isArray(doc?.['tokens']) ? doc['tokens'] : [],
    management: Array.isArray(doc?.['management']) ? doc['management'] : [],
  };
}

/** Rows compare as sets of canonically-serialized rows. */
function canonicalRow(row: unknown): string {
  if (row !== null && typeof row === 'object') {
    const record = row as Record<string, unknown>;
    return JSON.stringify(record, Object.keys(record).sort());
  }
  return JSON.stringify(row);
}

function rowsEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  if (left.length !== right.length) return false;
  const serializedLeft = left.map(canonicalRow).sort();
  const serializedRight = right.map(canonicalRow).sort();
  return serializedLeft.every((row, index) => row === serializedRight[index]);
}

/**
 * The surgery: `expected` is the state the caller built its splice from
 * (the live credential state on the wire, the file's own rows through
 * loadConfig on the manager), `next` is the post-splice state. Success
 * is silent; every refusal leaves the file and the caller's state as
 * they were.
 */
export function authorCredentials(
  configPath: string,
  expected: CredentialFamilies,
  next: CredentialFamilies,
): void {
  let raw: string;
  let created = false;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (err) {
    if (!(err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT')) {
      throw new ConfigError(`cannot read config at ${configPath}: ${(err as Error).message}`);
    }
    // The file is gone: with empty expected families this is the cold
    // host's first grant — a creation; with any live row it is a hand
    // that edited the credentials while running: drift, never silence.
    const emptyExpected = expected.tokens.length === 0 && expected.management.length === 0;
    if (!emptyExpected) {
      throw new CredentialDriftError(
        `the config file's credential rows have drifted from the running state ` +
          `(the file itself is gone) — external hand edits stay restart-to-apply: ` +
          `restart to re-author the file from the credential doors, or restore it, then retry`,
      );
    }
    created = true;
    raw = '{}';
  }
  let rawDoc: unknown;
  try {
    rawDoc = JSON.parse(raw);
  } catch {
    throw new ConfigError(
      `the credential surgery at ${configPath} refused — the file does not parse; ` +
        `a JSON validator shows the position (the refusal quotes nothing: it may carry a secret)`,
    );
  }
  const current = fileRows(rawDoc);
  if (
    !rowsEqual(current.tokens, expected.tokens) ||
    !rowsEqual(current.management, expected.management)
  ) {
    throw new CredentialDriftError(
      `the config file's credential rows have drifted from the running state — ` +
        `external hand edits stay restart-to-apply: restart to apply them (or revert the file), then retry`,
    );
  }
  const spliced = {
    ...(rawDoc as Record<string, unknown>),
    tokens: next.tokens,
    management: next.management,
  };
  // The full grammar, against the final document: the splice's rows and
  // every sibling key the write-back carries. A persisted refusal would
  // brick the next boot — the file refuses first.
  try {
    parseConfig(spliced);
  } catch (err) {
    throw new ConfigError(
      `the credential surgery at ${configPath} refused — the spliced document breaks the grammar: ` +
        `${(err as Error).message}`,
    );
  }
  const serialized = `${JSON.stringify(spliced, null, 2)}\n`;
  if (created) {
    mkdirSync(dirname(configPath), { recursive: true });
  }
  // The claim shape: written whole to a scratch name born 0600, fsynced,
  // renamed over the config — a reader (or a crash) never sees half a
  // credential file, and the file's mode comes from the scratch, so a
  // pre-existing looser file is tightened by the rename itself.
  const scratch = `${configPath}.author-${process.pid}-${Math.random().toString(36).slice(2)}`;
  let fd: number | undefined;
  try {
    fd = openSync(scratch, 'wx', 0o600);
    writeSync(fd, serialized);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(scratch, configPath);
  } catch (err) {
    if (fd !== undefined) closeSync(fd);
    rmSync(scratch, { force: true });
    throw new ConfigError(
      `the credential write at ${configPath} failed (${(err as { code?: string }).code ?? (err as Error).name}): ` +
        `the running state is unaffected; the file is untouched`,
    );
  }
}
