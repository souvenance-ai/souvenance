/**
 * The manager's liveness probe (ADR 0009): is a server running on the
 * configured host and port? One GET on `/healthz` — any answer means
 * the port is served, so the live credential state belongs to that
 * server and the manager's credential writes must refuse; every failure
 * (refused connection, the deadline, a host that does not resolve)
 * means no server behind the file's self-declared posture, and the
 * manager owns the config. The patience is one second over the WHOLE
 * request, not socket-idleness: node:http's own socket timeout counts
 * silent stretches, and a server dribbling bytes — partial headers
 * without the terminator, say — never goes silent, so the promise
 * carries its absolute deadline and settles exactly once, whatever
 * lands first (an answer, a refusal, the second's end); a slow-header
 * hang is refused like every other failure. The connection never
 * outlives its verdict: the one settle — alive or dead — frees the
 * socket, so a body that streams forever cannot hold the CLI process
 * open past the answer it already printed. The probe speaks
 * `node:http`'s request, not `fetch`: the fetch spec refuses whole
 * port ranges before a packet leaves (X11's 6000 among them), so a
 * live server on one of those ports was reported dead and the manager
 * would walk the drift window ADR 0009 refuses. `node:http` takes the
 * host as the socket's own option — no URL to build, an IPv6 literal
 * travels as-is; the `liveness-url` unit (the bracket workaround born
 * for the fetch idiom) died with it. Best-effort by design (the ADR's
 * escape, documented not solved): a server on a `--port`-overridden
 * boot is invisible, and the manager's writes degrade to the
 * restart-to-apply window of a hand edit. An `--host` the boot bound
 * to a non-loopback interface is probed like any other host — the file
 * speaks where the server listens.
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
    // The deadline is the promise's only judge: one verdict, whatever
    // lands first. The first settle clears the clock AND frees the
    // connection — the socket must never outlive its verdict — and the
    // rest (an 'error' the destroy releases finds its way here) read
    // the flag and stand down: exactly one settle per request.
    let settled = false;
    const settle = (verdict: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      probe.destroy();
      resolve(verdict);
    };
    const probe = request(
      {
        host: target.host,
        port: target.port,
        method: 'GET',
        path: '/healthz',
      },
      () => {
        // Any answer — this port is served. A foreign server on the
        // config's port is a collision the boot would have refused
        // config's port is a collision the boot would have refused
        // anyway. The body is never read: the arrival is the whole
        // verdict, and the settle's destroy frees the connection — a
        // body that streams forever cannot hold the CLI process open
        // past the answer it already printed.
        settle(true);
      },
    );
    // The request-wide patience: a down port refuses in microseconds,
    // an idle black hole dies at the second — but a server dribbling
    // bytes never leaves the socket idle, so the judge is the absolute
    // deadline. On its fire the verdict falls, the destroy rides the
    // settle itself.
    const deadline = setTimeout(() => {
      settle(false);
    }, LIVENESS_TIMEOUT_MS);
    // Refused connection, unresolvable host, a destroyed probe — every
    // failure class collapses into one verdict: not alive.
    probe.on('error', () => settle(false));
    probe.end();
  });
}
