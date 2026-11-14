/**
 * The CLI's one HTTP gesture: one request, one verdict — spoken by
 * `node:http` and `node:https`, never `fetch`. The probe's lesson (the
 * manager's liveness review, #102): the fetch spec refuses whole port
 * ranges before a packet leaves (X11's 6000 among them), so a live
 * server on one of those ports was reported unreachable and the client
 * would teach a lie. The patience is absolute over the WHOLE request —
 * headers and body — not socket idleness: a server dribbling bytes
 * never goes silent, so the deadline is the judge and it settles
 * exactly once, whatever lands first (an answer, a refusal, the
 * deadline's end). The connection never outlives its verdict: the one
 * settle frees the socket, so a body that streams forever cannot hold
 * the CLI process open past the answer it already carries. The wire's
 * answer is forwarded, never judged: the body parses (one JSON
 * document), the wire's declared markdown rides verbatim (the skills'
 * SKILL.md — an installation is a copy, never a transform, #77), or
 * the client serves its own refusal — the grammar is the server's
 * business, the reach is the client's.
 */
import { request as requestHttp, type ClientRequest, type IncomingMessage } from 'node:http';
import { request as requestHttps } from 'node:https';
import type { Binding } from '../../mcp/binding/binding.ts';

/**
 * The client's request-wide patience — the server's own request
 * ceiling mirrored: the wire kills a request it cannot judge within
 * its 30 s, and the client's deadline is the same number. One constant,
 * both sides of the wire, no drift to reconcile.
 */
const REQUEST_DEADLINE_MS = 30_000;

/** One call: the method, the concrete route path, the query, the body. */
export interface HttpCall {
  readonly method: 'get' | 'post' | 'delete';
  /**
   * The route's concrete path — `/memories`, `/memories/<id>`. The id
   * segments arrive already encoded; the composition rides the
   * binding's base URL verbatim (the bridge's own rule: the base URL
   * is the server's root).
   */
  readonly path: string;
  readonly query?: URLSearchParams;
  readonly body?: unknown;
}

/**
 * The body's own local gate: valid JSON can still be too deep for the
 * serializer — a parse that succeeded leaves a tree JSON.stringify
 * refuses (a RangeError, the stack's own ceiling). The body that does
 * not travel is a refusal, not a crash: one envelope, the client's
 * verdict at status 0.
 */
interface Serialized {
  readonly payload?: string;
  readonly refusal?: HttpAnswer;
}

function serialize(body: unknown): Serialized {
  if (body === undefined) return {};
  try {
    return { payload: JSON.stringify(body) };
  } catch {
    return {
      refusal: {
        status: 0,
        document: {
          error:
            'the body does not travel as one JSON document — the serializer refused it ' +
            '(valid JSON can still nest past the serializer\u2019s depths)',
        },
      },
    };
  }
}

/** The wire's verdict as the client received it — or the client's own refusal at status 0. */
export interface HttpAnswer {
  /**
   * The wire's status — or 0 when the verdict is the client's: the
   * server unreachable, the deadline fallen, a body that is not one
   * JSON document. The document's teaching names what happened.
   */
  readonly status: number;
  /**
   * The body the wire served, parsed — or the raw text when the wire
   * declared markdown (the skills' body, carried verbatim). Undefined
   * when it served nothing (204) or nothing this client could carry.
   */
  readonly document?: unknown;
}

/** One request, one verdict — the Bearer rides every call. */
export function httpCall(binding: Binding, call: HttpCall): Promise<HttpAnswer> {
  const url = new URL(`${binding.url}${call.path}`);
  if (call.query !== undefined) {
    for (const [key, value] of call.query) {
      url.searchParams.append(key, value);
    }
  }
  const serialized = serialize(call.body);
  if (serialized.refusal !== undefined) return Promise.resolve(serialized.refusal);
  const payload = serialized.payload;
  const transport = url.protocol === 'https:' ? requestHttps : requestHttp;
  return new Promise((resolve) => {
    let settled = false;
    let deadline: NodeJS.Timeout | undefined;
    let client: ClientRequest | undefined;
    const settle = (answer: HttpAnswer): void => {
      if (settled) return;
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      client?.destroy();
      resolve(answer);
    };
    const unreachable = (detail: string): HttpAnswer => ({
      status: 0,
      document: {
        error:
          `the server at ${binding.url} is not reachable (${detail}) — boot it: souvenance serve, ` +
          'or point SOUVENANCE_URL at the host that carries the store',
      },
    });
    // The one "not ours" verdict: a body the client can neither parse
    // (one JSON document) nor carry (the wire's declared markdown).
    const notOurs = (status: number): HttpAnswer => ({
      status: 0,
      document: {
        error:
          `the server answered ${status} with a body that is not one JSON document — ` +
          'the response is not ours',
      },
    });
    try {
      client = transport(
        {
          // The host as the socket's own option (the probe's lesson: no
          // URL reassembly) — and the URL parser's brackets leave here:
          // the option wants the bare literal (`::1`), the bracketed
          // form is a name the resolver chases (ENOTFOUND).
          hostname: url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname,
          port: url.port === '' ? undefined : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method: call.method.toUpperCase(),
          headers: {
            authorization: `Bearer ${binding.token}`,
            // The two shapes the client carries — the one header, no
            // per-call judge (the wire's routes declare their shapes,
            // the header is the client's declared tongue).
            accept: 'application/json, text/markdown',
            ...(payload === undefined
              ? {}
              : {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(payload).toString(),
                }),
          },
        },
        (response: IncomingMessage) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('error', (error: Error) => settle(unreachable(error.message)));
          response.on('end', () => {
            if (response.statusCode === 204) {
              settle({ status: 204 });
              return;
            }
            const status = response.statusCode ?? 0;
            const raw = Buffer.concat(chunks).toString('utf8');
            const contentType = (response.headers['content-type'] ?? '').toLowerCase();
            if (contentType.startsWith('application/json')) {
              let parsed: unknown;
              try {
                parsed = JSON.parse(raw);
              } catch {
                settle(notOurs(status));
                return;
              }
              settle({ status, document: parsed });
              return;
            }
            // The one text shape the wire declares — the skills'
            // SKILL.md body, an installation is a copy (#77, #82): the
            // raw rides verbatim. Every other text (a proxy's html
            // page, a redirect's prose) is not ours.
            if (status >= 200 && status < 300 && contentType.startsWith('text/markdown')) {
              settle({ status, document: raw });
              return;
            }
            settle(notOurs(status));
          });
        },
      );
    } catch (error) {
      settle(unreachable(error instanceof Error ? error.message : String(error)));
      return;
    }
    deadline = setTimeout(() => {
      settle({
        status: 0,
        document: {
          error:
            `the server at ${binding.url} did not answer within ${REQUEST_DEADLINE_MS / 1000} s — ` +
            'the request died at the deadline; the server may be stuck or the wire slow',
        },
      });
    }, REQUEST_DEADLINE_MS);
    client.on('error', (error: Error) => settle(unreachable(error.message)));
    client.end(payload ?? undefined);
  });
}
