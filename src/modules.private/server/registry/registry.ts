/**
 * The registry (#19): the stores dir IS the registry — nothing is
 * declared, every `<name>.db` in the dir is a store, and boot cold-opens
 * every one of them (the ADR 0001 ownership ceremony: lock first, then
 * open read-write — the lock arbitrates, the open may migrate). Fail-fast
 * on every refusal: a store that will not open or a name that breaks the
 * grammar kills the boot, because half-a-registry is a lie the surface
 * would serve as truth.
 *
 * The registry's own refusals carry StoreError codes too — create/fork/
 * remove speak the same vocabulary the facade does, and the server maps
 * codes to statuses once, honestly.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { STORE_NAME } from '../../config/config.ts';
import { Store, type Stats } from '../../store/store.ts';
import { StoreError } from '../../store/store-error/store-error.ts';
import { sidecarPaths } from '../../store/utils/sidecar-paths/sidecar-paths.ts';
import { OwnershipLock } from '../ownership-lock/ownership-lock.ts';

/** One open store and the lock that proves who owns it. */
interface Registered {
  readonly store: Store;
  readonly lock: OwnershipLock;
}

export class Registry {
  readonly #storesDir: string;
  readonly #registered: Map<string, Registered>;

  private constructor(storesDir: string, registered: Map<string, Registered>) {
    this.#storesDir = storesDir;
    this.#registered = registered;
  }

  /**
   * Opens the registry: every `*.db` in the dir is claimed (lock) and
   * opened read-write — the boot is the migration window. Any refusal
   * bubbles: the boot fails, nothing serves half a registry.
   */
  static open(storesDir: string): Registry {
    mkdirSync(storesDir, { recursive: true });
    const registry = new Registry(storesDir, new Map());
    for (const entry of readdirSync(storesDir)) {
      if (!entry.endsWith('.db')) continue;
      const name = entry.slice(0, -3);
      Registry.#assertName(name, `the registry file "${entry}"`);
      registry.#claim(name, (dbPath) => Store.open({ dbPath }));
    }
    return registry;
  }

  static #assertName(name: string, context?: string): void {
    if (!STORE_NAME.test(name)) {
      throw new StoreError(
        'invalid',
        `store name "${name}"${context !== undefined ? ` (${context})` : ''} breaks the grammar ` +
          `${STORE_NAME.source} — lowercase letter first, then lowercase letters, digits, hyphens, 32 chars total` +
          (context !== undefined ? '; rename it or move it out of the registry' : ''),
      );
    }
  }

  /**
   * The one claim ceremony: lock the name, build the store into it,
   * register; any refusal releases the lock before it bubbles. Every
   * path that adds a store to the registry walks through here — boot's
   * cold-open, create, fork.
   */
  #claim(name: string, build: (dbPath: string) => Store): Store {
    const dbPath = join(this.#storesDir, `${name}.db`);
    const lock = OwnershipLock.acquire(join(this.#storesDir, `${name}.lock`));
    // A failed claim must not leave its birth behind: a half-copied fork
    // or a refused open would otherwise resurrect at the next boot — cold
    // open over a half-born store, or a corrupt one bricking the boot.
    // The cleanup keeps to the files THIS claim created: a db handed to
    // the server from the outside is the operator's, its fate never ours.
    const handed = existsSync(dbPath);
    try {
      const store = build(dbPath);
      this.#registered.set(name, { store, lock });
      return store;
    } catch (err) {
      lock.release();
      if (!handed) {
        for (const path of sidecarPaths(dbPath)) {
          rmSync(path, { force: true });
        }
      }
      throw err;
    }
  }

  /** The open store, or undefined — the routes turn that into a 404. */
  get(name: string): Store | undefined {
    return this.#registered.get(name)?.store;
  }

  names(): readonly string[] {
    return [...this.#registered.keys()].sort();
  }

  /**
   * Every open store's descriptor — the name and its stats verbatim from
   * the facade, never the path: the routes' whole view of the registry,
   * so no route walks the map or re-learns the shape.
   */
  descriptors(): { name: string; stats: Stats }[] {
    return [...this.#registered.entries()]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([name, registered]) => ({ name, stats: registered.store.stats() }));
  }

  /** Creates an empty store: grammar-checked, collision-refused, locked, open. */
  create(name: string): Store {
    Registry.#assertName(name);
    if (this.#registered.has(name)) {
      throw new StoreError('conflict', `store "${name}" already exists`);
    }
    return this.#claim(name, (dbPath) => Store.open({ dbPath }));
  }

  /**
   * Forks a store into a new one. When the forked name is absent the
   * server composes one — `<source>-fork`, then `-fork-2`, … — the first
   * grammar-valid name free of collisions. Returns the forked name.
   */
  fork(source: string, forked?: string): string {
    const sourceStore = this.get(source);
    if (sourceStore === undefined) {
      throw new StoreError('not_found', `no store "${source}" in the registry`);
    }
    if (forked !== undefined) Registry.#assertName(forked);
    const name = forked ?? this.#composeForkName(source);
    if (this.#registered.has(name)) {
      throw new StoreError('conflict', `store "${name}" already exists`);
    }
    // The claim is the collision guard; the fork fills the claimed name in.
    this.#claim(name, (dbPath) => {
      sourceStore.fork(dbPath);
      return Store.open({ dbPath });
    });
    return name;
  }

  /**
   * The composed fork name: `<source>-fork`, then `-fork-2`, … — the
   * first candidate free in the registry wins. The suffix is bounded so
   * the composition never breaks the 32-char grammar: a long source
   * truncates before the suffix lands.
   */
  #composeForkName(source: string): string {
    for (let n = 1; n < 100; n++) {
      const suffix = n === 1 ? '-fork' : `-fork-${n}`;
      const candidate = `${source.slice(0, 32 - suffix.length)}${suffix}`;
      if (STORE_NAME.test(candidate) && !this.#registered.has(candidate)) return candidate;
    }
    throw new StoreError('conflict', `no free fork name for "${source}"`);
  }

  /**
   * Removes a store outright: db + WAL sidecars + lock (the #19 verdict —
   * hard delete, the manage cap is the confirmation). Unknown names refuse.
   */
  remove(name: string): void {
    const registered = this.#registered.get(name);
    if (registered === undefined) {
      throw new StoreError('not_found', `no store "${name}" in the registry`);
    }
    this.#registered.delete(name);
    // The release is owed whatever the close says: a throwing close must
    // never leave the name behind a still-beating heartbeat — the store
    // would refuse every re-acquisition until the process died. The
    // sidecars go only on a clean close: a db the close could not part
    // with keeps its files until the operator's hand.
    try {
      registered.store.close();
    } finally {
      registered.lock.release();
    }
    const dbPath = join(this.#storesDir, `${name}.db`);
    for (const path of sidecarPaths(dbPath)) {
      rmSync(path, { force: true });
    }
  }

  /** Releases every lock and closes every store — the clean shutdown. */
  close(): void {
    for (const [name, registered] of this.#registered) {
      try {
        registered.store.close();
      } finally {
        registered.lock.release();
      }
      this.#registered.delete(name);
    }
  }
}
