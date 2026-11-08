/**
 * The manager's liveness probe (ADR 0009): is a server running on the
 * configured host and port? One GET on `/healthz`, one second of
 * patience — any answer means the port is served, so the live
 * credential state belongs to that server and the manager's credential
 * writes must refuse; every failure (refused connection, timeout, a
 * host that does not resolve) means no server behind the file's
 * self-declared posture, and the manager owns the config. Best-effort
 * by design (the ADR's escape, documented not solved): a server on a
 * `--port`-overridden boot is invisible, and the manager's writes
 * degrade to the restart-to-apply window of a hand edit. An `--host`
 * the boot bound to a non-loopback interface is probed like any other
 * host — the file speaks where the server listens.
 */
import { livenessUrl, type LivenessTarget } from '../liveness-url/liveness-url.ts';

/** One second of patience — a down port refuses in microseconds; a black hole escapes. */
const LIVENESS_TIMEOUT_MS = 1_000;

export async function probeLiveness(target: LivenessTarget): Promise<boolean> {
  try {
    await fetch(livenessUrl(target), { signal: AbortSignal.timeout(LIVENESS_TIMEOUT_MS) });
    // Any answer — this port is served. A foreign server on the
    // config's port is a collision the boot would have refused anyway.
    return true;
  } catch {
    return false;
  }
}
