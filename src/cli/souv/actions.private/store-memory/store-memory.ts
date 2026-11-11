/**
 * `souv memory store` — the birth gesture: content, kind demanded, the
 * authored summary, the metadata, relations born with it, and the
 * birth curation. The local gates judge before any call (fail-fast):
 * the content and the kind by the missing-arg door, the JSON flags by
 * their own parse. The wire judges the grammar; the client judges only
 * that a JSON flag parses — one grammar, one judge.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import { missingArg } from '../../../../modules.private/cli/missing-arg/missing-arg.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import type { SouvAnswer } from '../answer/answer.ts';
import { answerOf } from '../answer/answer.ts';

export interface StoreMemoryArgs {
  readonly content?: string;
  readonly kind?: string;
  readonly summary?: string;
  readonly metadata?: string;
  readonly relations?: string;
  readonly hot?: boolean;
}

/** The JSON flags' local gate: parse or refuse — the shape is the wire's verdict. */
function parseFlag(
  flag: string,
  raw: string | undefined,
): { parsed?: unknown; refusal?: SouvAnswer } {
  if (raw === undefined) return {};
  try {
    return { parsed: JSON.parse(raw) };
  } catch {
    return {
      refusal: {
        document: { error: `${flag} must be one JSON document — this does not parse` },
        exitCode: 1,
      },
    };
  }
}

export async function storeMemory(binding: Binding, args: StoreMemoryArgs): Promise<SouvAnswer> {
  if (missingArg(args.content)) {
    return {
      document: { error: "the content is missing — pass it as the command's first argument" },
      exitCode: 1,
    };
  }
  if (missingArg(args.kind)) {
    return {
      document: {
        error:
          'the kind is missing — pass --kind: a memory is born classified (the vocabulary is free)',
      },
      exitCode: 1,
    };
  }
  const metadata = parseFlag('--metadata', args.metadata);
  if (metadata.refusal !== undefined) return metadata.refusal;
  const relations = parseFlag('--relations', args.relations);
  if (relations.refusal !== undefined) return relations.refusal;
  const body: Record<string, unknown> = { content: args.content, kind: args.kind };
  if (args.summary !== undefined) body['summary'] = args.summary;
  if (metadata.parsed !== undefined) body['metadata'] = metadata.parsed;
  if (relations.parsed !== undefined) body['relations'] = relations.parsed;
  if (args.hot === true) body['hot'] = true;
  const answer = await httpCall(binding, { method: 'post', path: '/memories', body });
  return answerOf(answer.status, answer.document);
}
