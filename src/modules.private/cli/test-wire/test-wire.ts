/**
 * The CLI tests' boot: one real listener on an ephemeral port, run
 * through the product's own birth flow — the store born over the wire
 * (`POST /stores`, the management grant as the Bearer) and its grant
 * minted the same way (#100, the secret served exactly once), the
 * config file authored into the boot's own temp dir (the wire mints by
 * authoring the one config; a programmatic boot without a file path
 * refuses the mint). Nothing is mocked: the tests speak the same
 * ceremony the rig does.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Binding } from '../../mcp/binding/binding.ts';
import { startServer, type RunningServer } from '../../server/serve/serve.ts';
import { httpCall } from '../http-call/http-call.ts';

/** The management row the boot carries — the fixed test secret (the server tests' precedent). */
const MANAGEMENT_SECRET = `souv-${'b'.repeat(32)}`;

/** The store grant's agent label — the request log's caller axis. */
const AGENT = 'agent';

/** The store the ceremony births — the tests' one named store. */
const STORE_NAME = 'mneme';

export interface TestWire {
  /** The management grant's binding — the host's hands. */
  readonly management: Binding;
  /** The store grant's binding — the store the ceremony birthed. */
  readonly store: Binding;
  /** The store's name, the agent's label — for the tests' own paths and rows. */
  readonly storeName: string;
  readonly agent: string;
  /** The listener closed, the temp dir gone. */
  close(): Promise<void>;
}

/** Boots the wire and runs the birth ceremony; refuses loudly when the flow itself breaks. */
export async function bootTestWire(): Promise<TestWire> {
  const dir = mkdtempSync(join(tmpdir(), 'souv-test-wire-'));
  // The config file exists BEFORE the boot — the wire mints by
  // authoring the one config, and its drift check reads the file: a
  // programmatic boot whose file is absent would refuse the mint as
  // drift (the file itself is gone). The battery's own ceremony does
  // the same: the file first, then the boot, the same rows both sides.
  const configPath = join(dir, 'config.json');
  writeFileSync(
    configPath,
    `${JSON.stringify({ management: [{ agent: 'valentin', secret: MANAGEMENT_SECRET }] }, null, 2)}\n`,
    'utf8',
  );
  let running: RunningServer;
  try {
    running = await startServer({
      port: 0,
      host: '127.0.0.1',
      storesDir: dir,
      tokens: [],
      management: [{ agent: 'valentin', secret: MANAGEMENT_SECRET }],
      version: 'test',
      configPath,
    });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  const management: Binding = {
    url: `http://127.0.0.1:${running.port}`,
    token: MANAGEMENT_SECRET,
  };
  try {
    const birth = await httpCall(management, {
      method: 'post',
      path: '/stores',
      body: { name: STORE_NAME },
    });
    if (birth.status !== 201) {
      throw new Error(`the test wire's birth refused: ${JSON.stringify(birth.document)}`);
    }
    const mint = await httpCall(management, {
      method: 'post',
      path: `/stores/${STORE_NAME}/grants`,
      body: { agent: AGENT, mode: 'rw' },
    });
    if (mint.status !== 201 || typeof mint.document !== 'object' || mint.document === null) {
      throw new Error(`the test wire's mint refused: ${JSON.stringify(mint.document)}`);
    }
    const { secret } = mint.document as { secret: unknown };
    if (typeof secret !== 'string') {
      throw new Error('the test wire\u2019s mint served no secret');
    }
    return {
      management,
      store: { url: management.url, token: secret },
      storeName: STORE_NAME,
      agent: AGENT,
      close: async () => {
        await running.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

/** A binding that reaches nothing — the local gates must precede any call. */
export const UNREACHABLE: Binding = { url: 'http://127.0.0.1:1', token: 'souv-0000' };

/** One test's body on its own wire — the boot and the close, one gesture. */
export async function onWire(run: (wire: TestWire) => Promise<void>): Promise<void> {
  const wire = await bootTestWire();
  try {
    await run(wire);
  } finally {
    await wire.close();
  }
}
