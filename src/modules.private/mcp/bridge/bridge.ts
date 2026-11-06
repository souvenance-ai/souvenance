/**
 * The bridge client (#22): one grant's posture on the wire. Every tool
 * call is one HTTP call carrying the grant's Bearer — the bridge never
 * opens a store, never touches the filesystem: the server is the only
 * owner (#17 — the MCP surface is a bridge, never a second owner).
 *
 * The wire's one envelope is the contract: 2xx serves the body (JSON
 * parsed, text served verbatim, 204 nothing to say), and every refusal
 * carries `{error: message}` whose message teaches — the bridge forwards
 * it verbatim (the mirror rule, #22) and invents no shapes. The one
 * message the bridge owns is the reachability teaching: when the server
 * is absent, no envelope can answer, so the bridge speaks in its place.
 */
import type { Binding } from '../binding/binding.ts';

/** The bridge's one failure shape: the message is the teaching, verbatim. */
export class BridgeError extends Error {}

/** One route call — the shapes the wire speaks. */
export interface RouteCall {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly query?: URLSearchParams;
  readonly body?: unknown;
}

export class Bridge {
  readonly #url: string;
  readonly #token: string;

  constructor(binding: Binding) {
    this.#url = binding.url;
    this.#token = binding.token;
  }

  /** The base URL the bridge answers at — teaching and tests read it. */
  get url(): string {
    return this.#url;
  }

  /**
   * The eager probe: liveness before speaking (#22). GET /healthz — the
   * one public door whose answer means "a souvenance server lives here".
   * Unreachable → the reachability teaching; a live answerer that is not
   * souvenance → the pointing-at-something-else teaching. Resolves void
   * when the bridge may speak.
   */
  async probe(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.#url}/healthz`, { method: 'GET' });
    } catch (error) {
      throw new BridgeError(reachabilityTeaching(this.#url, error));
    }
    if (!response.ok) {
      throw new BridgeError(
        `SOUVENANCE_URL points at something that is not a souvenance server — ` +
          `${this.#url}/healthz answered ${response.status}; the base URL is the server's root, no path`,
      );
    }
  }

  /**
   * One route call: the method, the path, the query, the body — the
   * Bearer rides every call. The answer follows the wire's own
   * declaration: JSON parsed, text carried verbatim (the skills' body),
   * 204 undefined — nothing to say. Any refusal throws BridgeError with
   * the envelope's message verbatim.
   */
  async call(route: RouteCall): Promise<unknown> {
    const url = new URL(`${this.#url}${route.path}`);
    if (route.query !== undefined) {
      for (const [key, value] of route.query) {
        url.searchParams.append(key, value);
      }
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: route.method,
        headers: {
          authorization: `Bearer ${this.#token}`,
          ...(route.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(route.body !== undefined ? { body: JSON.stringify(route.body) } : {}),
      });
    } catch (error) {
      throw new BridgeError(reachabilityTeaching(this.#url, error));
    }
    if (response.status === 204) return undefined;
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    if (response.ok) {
      if (contentType.startsWith('application/json')) {
        return JSON.parse(raw) as unknown;
      }
      return raw;
    }
    if (contentType.startsWith('application/json')) {
      const parsed: unknown = JSON.parse(raw);
      const message =
        typeof parsed === 'object' && parsed !== null && 'error' in parsed
          ? (parsed as { error: unknown }).error
          : undefined;
      if (typeof message === 'string') {
        throw new BridgeError(message);
      }
    }
    throw new BridgeError(
      `the server answered ${response.status} without its envelope: ${raw.slice(0, 200)}`,
    );
  }
}

/**
 * The one teaching the bridge owns — the server absent answers before
 * any envelope can. The fix names both doors: start the server, or point
 * the URL at the host that carries the store.
 */
function reachabilityTeaching(url: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return (
    `the server at ${url} is not reachable (${detail}) — start it with ` +
    '`souvenance serve`, or point SOUVENANCE_URL at the host that carries your store'
  );
}
