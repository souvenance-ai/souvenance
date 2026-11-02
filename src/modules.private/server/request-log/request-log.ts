/**
 * The opt-in request log (#69): the living capture's objective gestures —
 * one JSONL line per request, written after the response settles. The
 * wire logs nothing by itself (finding F3, #64): call counts, order,
 * timing, and refusal occurrences rested on self-reports, and the
 * debriefs disagreed where the wire could have arbitrated.
 *
 * Mounted FIRST in the app — before auth — so it wraps everything: the
 * public doors, the refused credentials, the teaching 404, the thrown
 * refusals. A refusal is logged like a 200. Its status is read from the
 * settled response — Hono funnels a downstream Error to onError at its
 * own frame, so this middleware sees the envelope's answer — or from the
 * in-flight error when one is still propagating (the same mapping
 * onError serves — error-status, no drift). The line carries the grant's
 * `agent` label, never the bearer — `null` only when no grant resolved.
 * The log is an operator's surface, not an API surface: /doc stays
 * silent on it, and a failed write never breaks the response (stderr,
 * wire intact). Off = not mounted at all: byte-identical behavior by
 * construction.
 */
import { appendFileSync } from 'node:fs';
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { ServerEnv } from '../auth/auth.ts';
import { errorStatus } from '../error-status/error-status.ts';

export interface RequestLogOptions {
  /** The JSONL file the lines append to; the boot opens it in append. */
  readonly path: string;
}

/**
 * The grant may be unset: this middleware is first and auth has not run
 * yet (or has refused) — the widened view of the shared env is honest
 * about it while sharing auth's own variables.
 */
type RequestLogEnv = Omit<ServerEnv, 'Variables'> & {
  Variables: { grant: ServerEnv['Variables']['grant'] | undefined };
};

export function requestLog(options: RequestLogOptions) {
  return createMiddleware<RequestLogEnv>(async (c, next) => {
    const startedAt = new Date().toISOString();
    const startedMs = performance.now();
    try {
      await next();
    } catch (err) {
      // The error is still in flight: its eventual status is the one the
      // envelope will serve — the same mapping, read in flight.
      writeLine(options.path, line(c, startedAt, startedMs, errorStatus(err)));
      throw err;
    }
    writeLine(options.path, line(c, startedAt, startedMs, c.res.status));
  });
}

/** The line's one shape, the ticket's field order — {ts, method, path, status, ms, agent}. */
function line(
  c: Context<RequestLogEnv>,
  startedAt: string,
  startedMs: number,
  status: number,
): string {
  const grant = c.get('grant');
  const url = new URL(c.req.raw.url);
  return `${JSON.stringify({
    ts: startedAt,
    method: c.req.method,
    path: url.pathname + url.search,
    status,
    ms: Math.round(performance.now() - startedMs),
    agent: grant?.agent ?? null,
  })}\n`;
}

function writeLine(path: string, line: string): void {
  try {
    appendFileSync(path, line, 'utf8');
  } catch (err) {
    // A failed journal write never breaks the response — the operator's
    // stderr carries it, the wire stays intact (#69: not an API surface).
    process.stderr.write(`request log write failed: ${(err as Error).message}\n`);
  }
}
