/**
 * The orientation door's mirror (#49 ruling 12): zero args serve the
 * index verbatim (one JSON document), one arg serves that skill's body
 * verbatim — the SKILL.md the wire declares text/markdown, an
 * installation is a copy, never a transform (#77), so the body rides
 * as text, no newline added (the served file ends its own). The name
 * is optional at the parser and absent IS the index; a dot segment is
 * not a name — the URL parser would fold it into a parent route and
 * the wire's 404 would never be asked (the shared judge). Every
 * refusal is the envelope's voice.
 */
import { httpCall } from '../../../../modules.private/cli/http-call/http-call.ts';
import type { Binding } from '../../../../modules.private/mcp/binding/binding.ts';
import { isDotSegment } from '../../../../modules.private/cli/dot-segment/dot-segment.ts';
import { answerOf, type SouvAnswer } from '../answer/answer.ts';
import { refusalOf } from '../refusal/refusal.ts';

export interface SkillsArgs {
  readonly name?: string;
}

export async function skills(binding: Binding, args: SkillsArgs): Promise<SouvAnswer> {
  const name = args.name;
  if (name !== undefined && isDotSegment(name)) {
    return refusalOf('the name is not ours — a dot segment is not a skill name');
  }
  const answer = await httpCall(binding, {
    method: 'get',
    path: name === undefined ? '/skills' : `/skills/${encodeURIComponent(name)}`,
  });
  if (answer.text !== undefined) {
    // The transport judged the DECLARATION — the verbatim carry of the
    // wire's markdown rides as the text door's own shape, no newline
    // added (the served file ends its own).
    return { text: answer.text, exitCode: 0 };
  }
  return answerOf(answer.status, answer.document);
}
