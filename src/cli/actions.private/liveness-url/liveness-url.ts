/**
 * The liveness probe's URL (ADR 0009: the manager's probe is the
 * configured port's `/healthz`): the config's host is a host literal
 * that `fetch` speaks back — bracketed when it is an IPv6 form, where a
 * bare `::1` would parse as a port separator and refuse before the
 * probe ever ran. One URL, the config's own posture: where the boot
 * listens is where the manager probes.
 */
export interface LivenessTarget {
  readonly host: string;
  readonly port: number;
}

export function livenessUrl(target: LivenessTarget): string {
  const hostLiteral = target.host.includes(':') ? `[${target.host}]` : target.host;
  const url = new URL(`http://${hostLiteral}/healthz`);
  url.port = String(target.port);
  return url.href;
}
