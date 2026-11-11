/**
 * The `souv` bin — the individual's client (ADR 0002): a pure consumer
 * of the running server's API, never local state. One JSON document per
 * invocation (#17), the binding the environment's (ADR 0008's grammar —
 * the bridge's own module, one grammar, both doors). The verbs speak
 * the wire's own family names; the wire judges, the client forwards.
 * The positionals are optional at the parser — commander's arg-count
 * check would exit on stderr, and the one-document contract demands the
 * absence ride to the action's own gate (the fork's precedent).
 */
import { program } from 'commander';
import pkg from '../../../package.json' with { type: 'json' };
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
import { storeMemory } from './actions.private/store-memory/store-memory.ts';

program
  .name('souv')
  .description('the client of a running souvenance server — one JSON document per invocation')
  .version(pkg.version);

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
  .option('--depth <depth>', TEACHING.depthProjection, (value: string): number =>
    Number.parseInt(value, 10),
  )
  .action((id: string | undefined, options: { readonly depth?: number }): Promise<void> =>
    run((binding) => getMemory(binding, { id, depth: options.depth })),
  );

memory
  .command('list')
  .description('one page in serving order — walk with --after, the caller loops')
  .option('--after <cursor>', TEACHING.pageCursor)
  .option('--limit <limit>', TEACHING.limitExplicit, (value: string): number =>
    Number.parseInt(value, 10),
  )
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
  .option('--limit <limit>', TEACHING.limitExplicit, (value: string): number =>
    Number.parseInt(value, 10),
  )
  .option('--kind <kind>', 'the kind filter — repeat the flag for several (IN)', collectStrings)
  .option(
    '--metadata <json>',
    'one URL-encoded JSON object of dot-path → scalar, AND across paths — passed through, judged by the wire',
  )
  .option('--include-terminals', 'serve the terminal memories too (superseded, deprecated, merged)')
  .action((text: string | undefined, options: Omit<SearchMemoriesArgs, 'text'>): Promise<void> =>
    run((binding) => searchMemories(binding, { ...options, text })),
  );

/** The one stdout gesture: exactly one JSON document, then the exit code. */
function emitAnswer(answer: SouvAnswer): void {
  process.stdout.write(`${JSON.stringify(answer.document)}\n`);
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

program.parse();
