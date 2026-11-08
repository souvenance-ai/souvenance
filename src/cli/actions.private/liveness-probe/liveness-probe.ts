/**
 * The manager's liveness probe (ADR 0009): is a server running on the
 * configured host and port? One GET on `/healthz`, one second of
 * patience — any answer means the port is served, so the live
 * credential state belongs to that server and the manager's credential
 * writes must refuse; every failure (refused connection, timeout, a
 * host that does not resolve) means no server behind the file's
 * self-declared posture, and the manager owns the config. The probe
 * speaks `node:http`'s request, not `fetch`: the fetch spec refuses
 * whole port ranges before a packet leaves (X11's 6000 among them), so
 * a live server on one of those ports was reported dead and the
 * manager's writes would walk the drift window ADR 0009 refuses.
 * `node:http` takes the host as the socket's own option — no URL to
 * build, an IPv6 literal travels as-is; the `liveness-url` unit (the
 * bracket workaround born for the fetch idiom) died with it.
 * Best-effort by design (the ADR's escape, documented not solved): a
 * server on a `--port`-overridden boot is invisible, and the manager's
 * writes degrade to the restart-to-apply window of a hand edit. An
 * `--host` the boot bound to a non-loopback interface is probed like
 * any other host — the file speaks where the server listens.
 */
import { request } from 'node:http';

/** The probe's target — the config's own posture: where the boot listens. */
export interface LivenessTarget {
  readonly host: string;
  readonly port: number;
}

/** One second of patience — a down port refuses in microseconds; a black hole escapes. */
const LIVENESS_TIMEOUT_MS = 1_000;

export async function probeLiveness(target: LivenessTarget): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = request(
      {
        host: target.host,
        port: target.port,
        method: 'GET',
        path: '/healthz',
        timeout: LIVENESS_TIMEOUT_MS,
      },
      (response) => {
        // Any answer — this port is served. A foreign server on the
        // config's port is a collision the boot would have refused
        // anyway. The body is never read: drained, the verdict stands.
        response.resume();
        resolve(true);
      },
    );
    // The patience of the old AbortSignal, viva: an idle socket beyond
    // the second destroys the request — not alive. node:http's timeout
    // never aborts by itself; the verdict is settled here, the destroy
    // a courtesy (a later 'error' finds an already-resolved promise).
    probe.on('timeout', () => {
      resolve(false);
      probe.destroy();
    });
    // Refused connection, unresolvable host, a destroyed probe — every
    // failure class collapses into one verdict: not alive.
    probe.on('error', () => resolve(false));
    probe.end();
  });
}
