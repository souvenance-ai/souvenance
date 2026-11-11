/**
 * The `souv` bin — the individual's client (ADR 0002): a pure consumer
 * of the running server's API, never local state. One JSON document per
 * invocation (#17), the binding the environment's (ADR 0008's grammar —
 * the bridge's own module, one grammar, both doors). The verbs speak
 * the wire's own family names; the wire judges, the client forwards.
 * The positionals are optional at the parser and the parser's own
 * errors ride `exitOverride` — commander would exit on stderr, and the
 * one-document contract demands every refusal teach on stdout (the
 * fork's precedent, extended to the flags).
 */
import { CommanderError, program } from 'commander';
import { writeSync } from 'node:fs';
import manifest from '../../../package.json' with { type: 'json' };
import { collectStrings } from '../../modules.private/cli/collect-strings/collect-strings.ts';
import { ConfigError } from '../../modules.private/config/config.ts';
import { resolveBinding, type Binding } from '../../modules.private/mcp/binding/binding.ts';
import { TEACHING } from '../../modules.private/teaching/teaching.ts';
import type { SouvAnswer } from './actions.private/answer/answer.ts';
import { getMemory } from './actions.private/get-memory/get-memory.ts';
import type { ListMemoriesArgs } from './actions.private/list-memories/list-memories.ts';
import { listMemories } from './actions.private/list-memories/list-memories.ts';
import type { SearchMemoriesArgs } from './actions.private/search-memories/search-memories.ts';
import { searchMemories } from './actions.private/search-memories/search-memories.ts';
import { refusalOf } from './actions.private/refusal/refusal.ts';
import { storeMemory } from './actions.private/store-memory/store-memory.ts';

program
  .name('souv')
  .description('the client of a running souvenance server — one JSON document per invocation')
  .version(manifest.version)
  // The override before the commands: the subcommands inherit the
  // parser's settings at their creation — set late, they would keep
  // commander's own process.exit and the contract's envelope would
  // never see the parser's refusals.
  .exitOverride();

const memory = program
  .command('memory')
  .description("the individual's memory verbs — the grant carries the store");

memory
  .command('store')
  .description('store a memory — born classified, the birth curation optional')
  .argument('[content]', "the memory's content")
  .option('--kind <kind>', TEACHING.kindBirth)
  .option('--summary <summary>', TEACHING.summary)
  .option(
    '--metadata <json>',
    `${TEACHING.metadataAuthored} — one JSON document, judged by the wire`,
  )
  .option(
    '--relations <json>',
    'relations born with the memory — one JSON array, each edge carrying its target and its kind',
  )
  .option('--hot', TEACHING.hotBirth)
  .action(
    (
      content: string | undefined,
      options: {
        readonly kind?: string;
        readonly summary?: string;
        readonly metadata?: string;
        readonly relations?: string;
        readonly hot?: boolean;
      },
    ): Promise<void> =>
      run((binding) =>
        storeMemory(binding, {
          content,
          kind: options.kind,
          summary: options.summary,
          metadata: options.metadata,
          relations: options.relations,
          hot: options.hot,
        }),
      ),
  );

memory
  .command('get')
  .description('read a memory — the projection, out-edges expanded to --depth')
  .argument('[id]', TEACHING.memoryId)
  .option('--depth <depth>', TEACHING.depthProjection, (value: string): number => Number(value))
  .action((id: string | undefined, options: { readonly depth?: number }): Promise<void> =>
    run((binding) => getMemory(binding, { id, depth: options.depth })),
  );

memory
  .command('list')
  .description('one page in serving order — walk with --after, the caller loops')
  .option('--after <cursor>', TEACHING.pageCursor)
  .option('--limit <limit>', TEACHING.limitExplicit, (value: string): number => Number(value))
  .option('--kind <kind>', 'the kind filter — repeat the flag for several (IN)', collectStrings)
  .option(
    '--metadata <json>',
    'one URL-encoded JSON object of dot-path → scalar, AND across paths — passed through, judged by the wire',
  )
  .option('--include-terminals', 'serve the terminal memories too (superseded, deprecated, merged)')
  .action((options: ListMemoriesArgs): Promise<void> =>
    run((binding) => listMemories(binding, options)),
  );

memory
  .command('search')
  .description('search the content — the bare ranked array, no cursor')
  .argument('[text]', TEACHING.searchText)
  .option('--limit <limit>', TEACHING.limitExplicit, (value: string): number => Number(value))
  .option('--kind <kind>', 'the kind filter — repeat the flag for several (IN)', collectStrings)
  .option(
    '--metadata <json>',
    'one URL-encoded JSON object of dot-path → scalar, AND across paths — passed through, judged by the wire',
  )
  .option('--include-terminals', 'serve the terminal memories too (superseded, deprecated, merged)')
  .action((text: string | undefined, options: Omit<SearchMemoriesArgs, 'text'>): Promise<void> =>
    run((binding) => searchMemories(binding, { ...options, text })),
  );

/** The one stdout gesture: exactly one JSON document, then the exit code —
 * the write is synchronous: the parser-error paths end the loop right
 * after it, and a piped stdout must not lose the verdict on exit. The
 * document's own serialization is guarded: a served tree the
 * serializer refuses is a refusal, not a crash (today the wire's own
 * c.json 500s first — this is the day that ever changes). */
function emitAnswer(answer: SouvAnswer): void {
  let line: string;
  try {
    line = `${JSON.stringify(answer.document)}\n`;
  } catch {
    line = `${JSON.stringify({
      error: 'the answer does not travel as one JSON document — the serializer refused it',
    })}\n`;
    process.exitCode = 1;
    writeSync(1, line);
    return;
  }
  writeSync(1, line);
  process.exitCode = answer.exitCode;
}

/**
 * The binding resolves once per invocation — lazily, inside the action,
 * so `--help` works bindingless. Its refusal is the 78 verdict: the
 * client's config is the environment, a slipped hand teaches.
 */
async function run(action: (binding: Binding) => Promise<SouvAnswer>): Promise<void> {
  let binding: Binding;
  try {
    binding = resolveBinding(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return emitAnswer({ document: { error: error.message }, exitCode: 78 });
    }
    throw error;
  }
  emitAnswer(await action(binding));
}

/**
 * The parser's own errors ride the one-document contract: `exitOverride`
 * turns commander's exits into throws, and the catch serves the refusal
 * envelope — exit 1, the teaching on stdout. The help and the version
 * already landed their text on stdout before their zero-exit throw; the
 * contract's letter holds there too (text is the door's own shape).
 */
try {
  program.parse();
} catch (error) {
  if (error instanceof CommanderError) {
    if (error.exitCode !== 0) {
      emitAnswer(refusalOf(error.message.replace(/^error: /, '')));
    } else {
      process.exitCode = 0;
    }
  } else {
    throw error;
  }
}
