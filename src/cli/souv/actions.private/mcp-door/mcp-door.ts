/**
 * The bridge's bin door (#49 ruling 13): `souv mcp` — the MCP stdio
 * server's composition root. The environment binds (one grammar with
 * the data verbs, ADR 0008); no flags, no args. stdout is protocol-only
 * (the MCP client parses it byte-for-byte — a stray envelope would
 * corrupt the stream), so the door's refusals speak on stderr: the
 * binding's absence is the 78 verdict (the config's own code), the
 * probe's refusal the 1 (the unreachable family — the data verbs'
 * status-0 verdict). A session that ends speaks: exit 0.
 */
import { ConfigError } from '../../../../modules.private/config/config.ts';
import { Bridge } from '../../../../modules.private/mcp/bridge/bridge.ts';
import { resolveBinding } from '../../../../modules.private/mcp/binding/binding.ts';
import { runMcpServer } from '../../../../modules.private/mcp/mcp/mcp.ts';
import { TOOLS } from '../../../../modules.private/mcp/tools/tools.ts';
import manifest from '../../../../../package.json' with { type: 'json' };

export async function mcpDoor(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  let binding;
  try {
    binding = resolveBinding(environment);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`souvenance mcp refuses to speak: ${error.message}\n`);
      process.exitCode = 78;
      return;
    }
    throw error;
  }
  const bridge = new Bridge(binding);
  const ending = await runMcpServer(
    { input: process.stdin, output: process.stdout },
    { bridge, tools: TOOLS, version: manifest.version, probe: () => bridge.probe() },
  );
  process.exitCode = ending === 'probe-refused' ? 1 : 0;
}
