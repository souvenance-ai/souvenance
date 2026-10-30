/**
 * The adversarial wire battery — the agent's black-box test rig over the
 * server's HTTP surface (#51's artifact; the session's field provenance:
 * 59/60 on the first pass, one finding, the fix [#57] replayed 60/60).
 *
 * The three properties any session must keep:
 * - **the served /doc is the canon.** The implementation is never read — the probes
 *   ask the wire what it does and fold every observed exchange against
 *   the served OpenAPI document (docAgrees). A wire change that breaks a
 *   probe is a claim to check against the document first.
 * - **Honest isolation.** Each battery boots a real `souvenance serve` on
 *   its own throwaway HOME (fresh config, fresh stores) on its own port;
 *   nothing reaches outside the host.
 * - **Agent economics.** The battery is not part of `fb:test`/CI — the 429
 *   window waits real seconds and the lifecycle phases kill and reboot
 *   the server; it exists for an agent session that can afford minutes
 *   (`node probes/run/run.ts`, all phases ~3 分钟; per-phase instead).
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The repo root — two directories up from this file (probes/battery/). */
export const REPO = new URL('../..', import.meta.url).pathname;

/** One store grant's strict shape (the config file's grant record, #63). */
export interface StoreGrant {
  readonly agent: string;
  readonly secret: string;
  readonly store: string;
  readonly mode: 'ro' | 'rw';
}

/** One management grant's strict shape (the config file's row, #63). */
export interface ManagementGrant {
  readonly agent: string;
  readonly secret: string;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The one credential header shape — every authenticated probe carries it. */
export const bearerHeaders = (secret: string): Record<string, string> => ({
  authorization: `Bearer ${secret}`,
});

export interface Exchange {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly json: unknown;
}

/**
 * One HTTP exchange against the live server, timestamps its deadline
 * and never throws a partial — a refused-socket race (a keep-alive pool
 * handing out a socket the server closed, e.g. right after a 413
 * mid-body abort) retries once when nothing reached the wire.
 */
export async function req(
  base: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options: { headers?: Record<string, string>; body?: string | object } = {},
  timeoutMs = 6000,
  attempt = 0,
): Promise<Exchange> {
  const { headers = {}, body } = options;
  try {
    const res = await fetch(base + path, {
      method,
      headers: body != null ? { 'content-type': 'application/json', ...headers } : headers,
      body: typeof body === 'string' ? body : body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text === '' ? null : (JSON.parse(text) as unknown);
    } catch {
      // non-JSON bodies stay in text — the cases read what they need
    }
    return { status: res.status, headers: res.headers, text, json };
  } catch (thrown) {
    const code = (thrown as { cause?: { code?: string } })?.cause?.code ?? '';
    const connectLevel =
      ['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code) &&
      attempt === 0;
    if (!connectLevel) throw thrown;
    await delay(60);
    return req(base, method, path, options, timeoutMs, attempt + 1);
  }
}

/**
 * One probe's ambient credential (#63): a req variant that always
 * carries the secret's bearer header — the case's own headers win when
 * a probe presents a different credential, or none at all.
 */
export function requestAs(
  secret: string,
): (
  url: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options?: { headers?: Record<string, string>; body?: string | object },
  timeoutMs?: number,
) => ReturnType<typeof req> {
  return (url, method, path, options = {}, timeoutMs) =>
    req(
      url,
      method,
      path,
      { ...options, headers: { ...bearerHeaders(secret), ...options.headers } },
      timeoutMs,
    );
}

/** One booted server process on a throwaway HOME. */
export class Server {
  readonly home: string;
  readonly port: number;
  readonly logPath: string;
  private base = '';
  private child: ReturnType<typeof spawn> | null = null;
  private dump: { out: string } = { out: '' };

  constructor({ home, port, logPath }: { home: string; port: number; logPath: string }) {
    this.home = home;
    this.port = port;
    this.logPath = logPath;
    this.base = `http://127.0.0.1:${port}`;
  }

  get url(): string {
    return this.base;
  }

  get servedLog(): string {
    return this.dump.out;
  }

  /** True while the process has not exited (cases poll this for boot races). */
  get live(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  get exit(): number | null {
    return this.child?.exitCode ?? null;
  }

  /** Cold boot: the process spawns and either dies or reports its log. */
  async rawBoot(env: Record<string, string> = {}): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    this.child = spawn('node', ['src/cli/cli.ts', 'serve', '--port', String(this.port)], {
      cwd: REPO,
      env: { ...process.env, HOME: this.home, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    this.child.stdout?.on('data', (chunk) => stdout.push(String(chunk)));
    this.child.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
    this.dump = { out: '' };
    this.child.on('exit', () => {
      (void stdout, void stderr);
      this.dump = { out: stderr.join('') + stdout.join('') };
    });
    // the served log flushes on exit; a mid-life dump still reads the tail
    const collect = (): void => {
      this.dump = { out: stderr.join('') + stdout.join('') };
    };
    this.child.stderr?.on('end', collect);
    this.child.stdout?.on('end', collect);
  }

  /** Booted = healthz answered 200 within the deadline; a dead boot is fatal infra. */
  async boot(env: Record<string, string> = {}, timeoutMs = 7000): Promise<void> {
    await this.rawBoot(env);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.child && this.child.exitCode !== null) {
        throw new Error(`server died at boot — ${this.dump.out}`);
      }
      try {
        const health = await req(this.base, 'GET', '/healthz', {}, 1200);
        if (health.status === 200) return;
      } catch {
        // not up yet
      }
      await delay(120);
    }
    throw new Error(`server never became healthy in ${timeoutMs}ms — ${this.dump.out}`);
  }

  async stop(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (!this.child || this.child.exitCode !== null) return;
    const done = new Promise<void>((resolve) => this.child!.once('exit', () => resolve()));
    this.child.kill(signal);
    await done;
    await delay(100);
  }
}

/**
 * Light OpenAPI folding: types, required, enum, additionalProperties,
 * nullable — the docAgrees contract's own validator, no schemas library.
 */
export function lightJsonValidate(
  schema: unknown,
  value: unknown,
  path = '$',
  errors: string[] = [],
  doc: unknown = null,
): string[] {
  const node = schema as {
    $ref?: string;
    oneOf?: unknown[];
    type?: string | string[];
    enum?: unknown[];
    required?: string[];
    additionalProperties?: boolean | unknown;
    properties?: Record<string, unknown>;
    items?: unknown;
    nullable?: boolean;
  };
  if (node == null) return errors;
  if (node.$ref) {
    const segments = node.$ref.slice(2).split('/');
    let target = doc as Record<string, Record<string, unknown>> | null;
    for (const segment of segments) target = target?.[segment] as typeof target;
    if (!target) {
      errors.push(`${path}: unresolvable ref ${node.$ref}`);
      return errors;
    }
    return lightJsonValidate(target, value, path, errors, doc);
  }
  if (node.oneOf) {
    const anyOk = node.oneOf.some(
      (alternative) => lightJsonValidate(alternative, value, path, [], doc).length === 0,
    );
    if (!anyOk) errors.push(`${path}: matches none of oneOf`);
    return errors;
  }
  if (Array.isArray(value)) {
    if (node.type === 'array' && node.items) {
      value.forEach((entry, index) =>
        lightJsonValidate(node.items, entry, `${path}[${index}]`, errors, doc),
      );
    } else {
      errors.push(`${path}: expected ${node.type ?? 'scalar'}, got array`);
    }
    return errors;
  }
  if (value !== null && typeof value === 'object') {
    if (node.type !== 'object' && node.type != null) {
      errors.push(`${path}: expected ${node.type}, got object`);
      return errors;
    }
    for (const key of node.required ?? [])
      if (!(key in (value as Record<string, unknown>)))
        errors.push(`${path}: required '${key}' missing`);
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (!(key in (node.properties ?? {})))
          errors.push(`${path}: additional key '${key}' forbidden`);
      }
    }
    for (const [key, sub] of Object.entries(node.properties ?? {})) {
      if (key in (value as Record<string, unknown>)) {
        lightJsonValidate(
          sub,
          (value as Record<string, unknown>)[key],
          `${path}.${key}`,
          errors,
          doc,
        );
      }
    }
    return errors;
  }
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (actual === 'null') {
    if (node.nullable !== true)
      errors.push(`${path}: null served but the schema does not declare nullable`);
    return errors;
  }
  if (node.type != null) {
    const expected = Array.isArray(node.type) ? node.type : [node.type];
    if (!expected.includes(actual)) {
      errors.push(
        `${path}: expected ${expected.join('/')} — got ${actual}=${JSON.stringify(value)?.slice(0, 40)}`,
      );
    }
  }
  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${path}: not in enum ${JSON.stringify(node.enum).slice(0, 60)}`);
  }
  return errors;
}

export function ok(describe: string): ProbeVerdict {
  return { ok: true, describe };
}

export function fail(describe: string, severity: FindingSeverity = 'bug'): ProbeVerdict {
  return { ok: false, describe, severity };
}

/** A JSON object-shaped payload the cases can field-read safely. */
export interface ProbeRecord {
  readonly [key: string]: unknown;
}

export const record = (value: unknown): ProbeRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ProbeRecord)
    : null;

export const records = (value: unknown): readonly ProbeRecord[] =>
  Array.isArray(value)
    ? (value.filter(
        (entry) => entry !== null && typeof entry === 'object',
      ) as readonly ProbeRecord[])
    : [];

export type FindingSeverity = 'bug' | 'doc-gap' | 'surprise';

export interface ProbeVerdict {
  readonly ok: boolean;
  readonly describe?: string;
  readonly severity?: FindingSeverity;
}

/** The served /doc's slice the battery reads — paths, methods, responses. */
export interface ServedDocument {
  readonly openapi?: string;
  readonly info?: { readonly title?: string };
  readonly paths?: Record<
    string,
    Record<
      string,
      {
        readonly responses?: Record<
          string,
          {
            readonly content?: Record<string, { readonly schema: unknown }>;
          }
        >;
      }
    >
  >;
  readonly components?: { readonly schemas?: Record<string, unknown> };
}

/**
 * Fold one observed exchange against the served document: the status must
 * be declared for the route+method and the body must satisfy the declared
 * schema. routePath is the literal OpenAPI path ('/stores/{name}…').
 */
export function docAgrees(
  battery: Battery,
  routePath: string,
  method: 'GET' | 'POST' | 'DELETE',
  status: number,
  body: unknown,
): ProbeVerdict {
  const document = battery.document as ServedDocument | null;
  const operation = document?.paths?.[routePath]?.[method.toLowerCase()];
  if (!operation)
    return fail(`route ${routePath} — the doc has no ${method}: observed ${status}`, 'doc-gap');
  const declared = operation.responses ?? {};
  const match = Object.entries(declared).find(
    ([code]) => code === String(status) || (code === 'default' && status >= 400),
  );
  if (!match)
    return fail(
      `${method} ${routePath} → ${status}: /doc declares ${Object.keys(declared).join(',')} only`,
    );
  const schema = match[1]?.content?.['application/json']?.schema;
  if (!schema) return ok(`${method} ${routePath} → ${status} (declared, non-JSON or empty schema)`);
  const violations = lightJsonValidate(schema, body, 'body', [], battery.document);
  if (violations.length > 0) {
    return fail(
      `${method} ${routePath} → ${status} body vs declarations: ${violations.slice(0, 3).join(' | ')}`,
      'doc-gap',
    );
  }
  return ok(`${method} ${routePath} → ${status} (declared + body shape)`);
}

/** A battery case: identity + one protocol probe against a live battery. */
export interface ProbeCase {
  readonly id: string;
  readonly name: string;
  readonly run: (battery: Battery) => Promise<ProbeVerdict>;
}

export class Battery {
  readonly name: string;
  readonly port: number;
  readonly cases: readonly ProbeCase[];
  readonly stores: readonly string[];
  readonly tokens: readonly StoreGrant[] | null;
  readonly management: readonly ManagementGrant[] | null;
  readonly root: string;
  private phaseServed?: Server;
  document: unknown = null;

  constructor({
    name,
    port,
    cases,
    stores = [],
    tokens = null,
    management = null,
    root,
  }: {
    name: string;
    port: number;
    cases: readonly ProbeCase[];
    stores?: readonly string[];
    tokens?: readonly StoreGrant[] | null;
    management?: readonly ManagementGrant[] | null;
    /** The throwaway work dir for this run (fresh per invocation). */
    root: string;
  }) {
    this.name = name;
    this.port = port;
    this.cases = cases;
    this.stores = stores;
    this.tokens = tokens;
    this.management = management;
    this.root = root;
  }

  get homePath(): string {
    return join(this.root, 'home');
  }

  get server(): Server | undefined {
    return this.phaseServed;
  }

  /** Hand the running torch over: the probes' further cases aim at this host. */
  adopt(server: Server): void {
    this.phaseServed = server;
  }

  async writeConfig(config: object): Promise<void> {
    const path = join(this.homePath, '.souvenance', 'config.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(config, null, 2) + '\n');
  }

  /**
   * grandOpening(): the operator's ceremony, in the production posture
   * (#63) — the boot carries the management family alone (a fresh host
   * is bootable with zero store grants, and births its stores over
   * HTTP with the management credential), then the ceremony re-boots
   * granted: both families in the config. The /doc is refetched after
   * the granted boot (both serve; trivially equal).
   */
  async grandOpening(env: Record<string, string> = {}): Promise<Server> {
    const server = new Server({
      home: this.homePath,
      port: this.port,
      logPath: join(this.root, 'logs', 'serve.log'),
    });
    this.phaseServed = server;
    await this.writeConfig(this.management ? { management: this.management } : {});
    await server.boot(env);
    this.document = (await req(server.url, 'GET', '/doc')).json;
    const managementRow = this.management?.[0];
    for (const name of this.stores) {
      const made = await req(server.url, 'POST', '/stores', {
        headers: managementRow ? bearerHeaders(managementRow.secret) : {},
        body: { name },
      });
      if (made.status !== 201)
        throw new Error(`grandOpening: ${made.status} creating ${name}: ${made.text}`);
    }
    if ((this.tokens?.length ?? 0) > 0 || (this.management?.length ?? 0) > 0) {
      await server.stop();
      this.phaseServed = undefined;
      await this.writeConfig({ tokens: this.tokens ?? [], management: this.management ?? [] });
      const granted = new Server({
        home: this.homePath,
        port: this.port,
        logPath: join(this.root, 'logs', 'serve.log'),
      });
      this.phaseServed = granted;
      await granted.boot(env, 9000);
      this.document = (await req(granted.url, 'GET', '/doc')).json;
    }
    return this.phaseServed!;
  }
}

interface RecordedCase {
  readonly id: string;
  readonly name: string;
  readonly ok: boolean;
  readonly describe?: string;
  readonly severity?: FindingSeverity;
  readonly ms: number;
}

/** runBattery(): sequential cases; hard-stop on infra failure; returns the findings count. */
export async function runBattery(battery: Battery): Promise<number> {
  const results: RecordedCase[] = [];
  const findings: RecordedCase[] = [];
  try {
    await rm(battery.root, { recursive: true, force: true });
    await battery.grandOpening();
    for (const probeCase of battery.cases) {
      const started = Date.now();
      let verdict: ProbeVerdict;
      try {
        verdict = await probeCase.run(battery);
      } catch (thrown) {
        verdict = fail(`${probeCase.id} blew up: ${String((thrown as Error)?.message ?? thrown)}`);
      }
      const recorded: RecordedCase = {
        id: probeCase.id,
        name: probeCase.name,
        ok: verdict.ok,
        describe: verdict.describe,
        severity: verdict.ok ? undefined : verdict.severity,
        ms: Date.now() - started,
      };
      results.push(recorded);
      if (!recorded.ok) findings.push(recorded);
      console.log(
        `[${recorded.ok ? 'PASS' : `FAIL(${recorded.severity ?? '?'})`}] ${recorded.id} ${recorded.name} — ${recorded.describe ?? ''}`,
      );
    }
  } finally {
    await battery.server?.stop();
    const dir = join(battery.root, 'logs');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'report.json'),
      JSON.stringify({ results, findings }, null, 2) + '\n',
    );
  }
  console.log(
    `${battery.name}: ${results.filter((r) => r.ok).length}/${results.length} pass, ${findings.length} findings`,
  );
  return findings.length;
}
