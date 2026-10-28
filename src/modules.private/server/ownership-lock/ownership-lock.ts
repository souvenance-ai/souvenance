/**
 * The ownership lock (ADR 0001): one owner per store, claimed by a lock
 * file beside the db — `<name>.lock`, JSON `{pid, claim, acquired_at,
 * heartbeat_at}`. While the server owns a store, every operation flows
 * through it; a second would-be owner is refused while the heartbeat
 * beats. A lock whose heartbeat has gone silent for STALE_MS is the
 * evidence its owner is dead: the next acquirer breaks it and takes
 * over — no manual recover ritual stands in front of a crashed server's
 * stores (the manager's recover verb, when the CLI lands, is for the
 * live-lock "is it really running?" doubt, not this).
 *
 * The claim itself is atomic: the document is written to a scratch name
 * and linked (never renamed) over the lock path — a reader never sees a
 * half-written lock. A lock that does not parse is refused with the
 * teaching (a hand can delete it; the code does not guess). The claim's
 * identity rides the document: a beat or a release against a foreign
 * claim refuses — the owner was replaced, and a replaced owner neither
 * refreshes nor deletes its successor.
 */
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

export const HEARTBEAT_MS = 5_000;
export const STALE_MS = 30_000;

export interface OwnershipLockOptions {
  /** How often the heartbeat rewrites the lock. Default 5 s (#20, Q9). */
  readonly heartbeatMs?: number;
  /** Silence beyond this age marks the owner dead. Default 30 s (#20, Q9). */
  readonly staleMs?: number;
  /** The clock, injectable for tests. */
  readonly now?: () => number;
}

interface LockDocument {
  readonly pid: number;
  /** The claim's identity: one per acquire — two locks of one process are still two owners. */
  readonly claim: string;
  readonly acquired_at: number;
  readonly heartbeat_at: number;
}

export class OwnershipLock {
  #heartbeatTimer: NodeJS.Timeout | undefined;
  readonly #lockPath: string;
  readonly #heartbeatMs: number;
  readonly #now: () => number;
  readonly #claim: string;

  private constructor(lockPath: string, options: OwnershipLockOptions, claim: string) {
    this.#lockPath = lockPath;
    this.#heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    this.#now = options.now ?? Date.now;
    this.#claim = claim;
  }

  /**
   * Claims the lock, refusing while a live owner holds it, breaking a
   * stale one. The refusing message names the holding pid — the operator
   * checks that process, not a riddle.
   */
  static acquire(lockPath: string, options: OwnershipLockOptions = {}): OwnershipLock {
    const now = options.now ?? Date.now;
    const staleMs = options.staleMs ?? STALE_MS;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return OwnershipLock.#stake(lockPath, options);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== 'EEXIST' && code !== 'ENOENT') throw err;
      }
      const held = OwnershipLock.#readHeld(lockPath);
      if (now() - held.heartbeat_at <= staleMs) {
        throw new Error(
          `store is owned by pid ${held.pid} (heartbeat ${now() - held.heartbeat_at}ms ago) — ` +
            `if that process is truly gone, its lock goes stale (breakable) after ${staleMs}ms of silence`,
        );
      }
      // Stale: the owner's silence is the evidence. Break and reclaim.
      rmSync(lockPath, { force: true });
    }
    // Two stale-breaks lost: another acquirer won both races and now
    // holds a live lock. Refuse — the winner's heartbeat decides from here.
    const held = OwnershipLock.#readHeld(lockPath);
    throw new Error(`store is owned by pid ${held.pid} — lock contention lost twice, refusing`);
  }

  static #stake(lockPath: string, options: OwnershipLockOptions): OwnershipLock {
    const now = options.now ?? Date.now;
    mkdirSync(dirname(lockPath), { recursive: true });
    // The claim is atomic twice over: the document is fully written to a
    // scratch name, then LINKED (never renamed) onto the lock path — link
    // fails with EEXIST when a live lock is already there, where rename
    // would silently replace it and steal the ownership.
    const claim = randomUUID();
    const scratch = `${lockPath}.claim-${process.pid}-${Math.random().toString(36).slice(2)}`;
    const fd = openSync(scratch, 'wx');
    try {
      writeSync(
        fd,
        JSON.stringify({ pid: process.pid, claim, acquired_at: now(), heartbeat_at: now() }),
      );
    } finally {
      closeSync(fd);
    }
    try {
      linkSync(scratch, lockPath);
    } catch (err) {
      rmSync(scratch, { force: true });
      throw err;
    }
    unlinkSync(scratch);
    return new OwnershipLock(lockPath, options, claim).#beat();
  }

  static #readHeld(lockPath: string): LockDocument {
    let raw: string;
    try {
      raw = readFileSync(lockPath, 'utf8');
    } catch (err) {
      // ENOENT rides raw: the file vanished mid-read — an acquirer's
      // stale-break racing us. The acquire loop knows that shape.
      if ((err as { code?: string }).code === 'ENOENT') throw err;
      throw new Error(`ownership lock at ${lockPath} cannot be read: ${(err as Error).message}`);
    }
    try {
      return JSON.parse(raw) as LockDocument;
    } catch {
      throw new Error(
        `ownership lock at ${lockPath} does not parse — a hand wrote there; ` +
          `no owner can be named, delete the file if no server runs`,
      );
    }
  }

  #beat(): this {
    this.#heartbeatTimer = setInterval(() => {
      const held = OwnershipLock.#readHeld(this.#lockPath);
      // The claim is the ownership's witness (pid alone cannot tell two
      // locks of one process apart): a foreign document means the lock
      // was judged stale and taken over while we were silent — two live
      // read-write owners is the exact state the lock exists to forbid,
      // so this owner stops beating and dies loudly rather than refresh
      // its successor's claim or outlive its own.
      if (held.claim !== this.#claim) {
        clearInterval(this.#heartbeatTimer);
        throw new Error(
          `ownership of ${this.#lockPath} was taken over by pid ${held.pid} — ` +
            `this process was judged dead; it refuses to serve a store it no longer owns`,
        );
      }
      const fd = openSync(`${this.#lockPath}.claim-${process.pid}`, 'w');
      try {
        writeSync(fd, JSON.stringify({ ...held, heartbeat_at: this.#now() }));
      } finally {
        closeSync(fd);
      }
      renameSync(`${this.#lockPath}.claim-${process.pid}`, this.#lockPath);
    }, this.#heartbeatMs);
    // The heartbeat guards ownership; it must not keep a dying server
    // alive past its listener — the listener is the reason we run.
    this.#heartbeatTimer.unref();
    return this;
  }

  release(): void {
    if (this.#heartbeatTimer !== undefined) clearInterval(this.#heartbeatTimer);
    // A foreign claim under our hand means the same takeover: this hand
    // lost the store, and its release must not delete the successor's
    // claim — it refuses instead.
    const held = OwnershipLock.#readHeld(this.#lockPath);
    if (held.claim !== this.#claim) {
      throw new Error(
        `cannot release ${this.#lockPath}: ownership moved to pid ${held.pid} — ` +
          `this lock is no longer ours to release`,
      );
    }
    rmSync(this.#lockPath, { force: true });
  }
}
