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
import { checkin } from './actions.private/checkin/checkin.ts';
import { checkout } from './actions.private/checkout/checkout.ts';
import { deprecateMemory } from './actions.private/deprecate-memory/deprecate-memory.ts';
import { getMemory } from './actions.private/get-memory/get-memory.ts';
import { hotMemory } from './actions.private/hot-memory/hot-memory.ts';
import { linkMemories } from './actions.private/link-memories/link-memories.ts';
import type { ListMemoriesArgs } from './actions.private/list-memories/list-memories.ts';
import { listMemories } from './actions.private/list-memories/list-memories.ts';
import { mergeMemories } from './actions.private/merge-memories/merge-memories.ts';
import { refusalOf } from './actions.private/refusal/refusal.ts';
import type { SearchMemoriesArgs } from './actions.private/search-memories/search-memories.ts';
import { searchMemories } from './actions.private/search-memories/search-memories.ts';
import { storeMemory } from './actions.private/store-memory/store-memory.ts';
import { supersedeMemory } from './actions.private/supersede-memory/supersede-memory.ts';
import { unlinkMemories } from './actions.private/unlink-memories/unlink-memories.ts';

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

memory
  .command('supersede')
  .description('revise a memory — the content moves to a successor, the old turns superseded')
  .argument('[id]', TEACHING.memoryId)
  .argument('[content]', "the successor's content")
  .option('--kind <kind>', TEACHING.kindSuccessor)
  .option('--summary <summary>', TEACHING.summary)
  .option(
    '--metadata <json>',
    `${TEACHING.metadataAuthored} — one JSON document, judged by the wire`,
  )
  .option(
    '--relations <json>',
    'relations born with the successor — one JSON array, each edge carrying its target and its kind; absent, the source\u2019s outgoing edges inherit verbatim',
  )
  .action(
    (
      id: string | undefined,
      content: string | undefined,
      options: {
        readonly kind?: string;
        readonly summary?: string;
        readonly metadata?: string;
        readonly relations?: string;
      },
    ): Promise<void> => run((binding) => supersedeMemory(binding, { id, content, ...options })),
  );

memory
  .command('deprecate')
  .description('retire a memory — a terminal: every gesture refuses it afterward')
  .argument('[id]', TEACHING.memoryId)
  .action((id: string | undefined): Promise<void> =>
    run((binding) => deprecateMemory(binding, { id })),
  );

memory
  .command('hot')
  .description(
    "the reversible curation — active ↔ hot, the sub-state a fresh session's checkin serves",
  )
  .argument('[id]', TEACHING.memoryId)
  .argument(
    '[verdict]',
    'the verdict — on lands the memory in the hot block, off cools it back to active',
  )
  .action((id: string | undefined, verdict: string | undefined): Promise<void> =>
    run((binding) => hotMemory(binding, { id, verdict })),
  );

memory
  .command('link')
  .description('relate two memories — one directed edge, born with its kind')
  .argument('[id]', TEACHING.memoryId)
  .option('--to <id>', TEACHING.edgeTo)
  .option('--kind <kind>', TEACHING.edgeKind)
  .option('--metadata <json>', `${TEACHING.edgeMetadata} — one JSON document, judged by the wire`)
  .action(
    (
      id: string | undefined,
      options: { readonly to?: string; readonly kind?: string; readonly metadata?: string },
    ): Promise<void> =>
      run((binding) =>
        linkMemories(binding, {
          id,
          target: options.to,
          kind: options.kind,
          metadata: options.metadata,
        }),
      ),
  );

memory
  .command('unlink')
  .description(
    'unrelate two memories — ambiguous edges need the kind, the wire names the candidates',
  )
  .argument('[id]', TEACHING.memoryId)
  .option('--to <id>', TEACHING.unlinkTo)
  .option('--kind <kind>', TEACHING.unlinkKind)
  .action(
    (
      id: string | undefined,
      options: { readonly to?: string; readonly kind?: string },
    ): Promise<void> =>
      run((binding) => unlinkMemories(binding, { id, target: options.to, kind: options.kind })),
  );

memory
  .command('merge')
  .description(
    'fuse memories — the sources become one, each keeping its merges bridge as provenance',
  )
  .argument('[content]', "the fusion's content")
  .option('--id <id>', "a source memory's id — repeat the flag for several", collectStrings)
  .option('--kind <kind>', TEACHING.kindFusion)
  .option('--summary <summary>', TEACHING.summary)
  .option(
    '--metadata <json>',
    `${TEACHING.metadataAuthored} — one JSON document, judged by the wire`,
  )
  .action(
    (
      content: string | undefined,
      options: {
        readonly id?: readonly string[];
        readonly kind?: string;
        readonly summary?: string;
        readonly metadata?: string;
      },
    ): Promise<void> =>
      run((binding) =>
        mergeMemories(binding, {
          content,
          ids: options.id,
          kind: options.kind,
          summary: options.summary,
          metadata: options.metadata,
        }),
      ),
  );

program
  .command('checkin')
  .description(
    "open a session — the hot memories with their relations, the store's stats, the waking guidance",
  )
  .option('--limit <limit>', TEACHING.limitCheckin, (value: string): number => Number(value))
  .action((options: { readonly limit?: number }): Promise<void> =>
    run((binding) => checkin(binding, options)),
  );

program
  .command('checkout')
  .description('close a session — the consolidation verdict, healthy or the payable findings')
  .action((): Promise<void> => run((binding) => checkout(binding)));

/** The one stdout gesture: exactly one JSON document, then the exit code —
 * written synchronously at fd 1 (stdout): the parser-error paths end the
 * loop right after the write, and a piped stdout must not lose the
 * verdict on exit. The document's own serialization is guarded: a served
 * tree the serializer refuses is a refusal, not a crash (today the
 * wire's own c.json 500s first — this is the day that ever changes). */
function emitAnswer(answer: SouvAnswer): void {
  let line: string;
  try {
    line = `${JSON.stringify(answer.document)}\n`;
  } catch {
    // The served tree itself does not travel: the same envelope voice
    // (`refusalOf`), the client's own verdict.
    const refusal = refusalOf(
      'the answer does not travel as one JSON document — the serializer refused it',
    );
    writeSync(1, `${JSON.stringify(refusal.document)}\n`);
    process.exitCode = refusal.exitCode;
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
