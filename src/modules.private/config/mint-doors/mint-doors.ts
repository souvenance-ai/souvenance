/**
 * The mint doors' one voice (the offline mints' shared dialogue): every
 * phrase a mint door speaks on refusal, declared once so the store
 * family's door and the fork's birth door cannot drift apart. The wire
 * keeps its own renderings (the 400 grammar refusals) — these are the
 * manager's offline words, born with the grant family and carried by
 * the fork's opt-in birth mint (#48 slice 4).
 */

/** The one TTY refusal, spoken at every door that serves a secret (#48 ruling 3). */
export const PIPED_TEACHING =
  'the secret never crosses a pipe — run it in a terminal, where stdout is a TTY';

/** The agent's one teaching, at the door that asks for one. */
export const AGENT_REQUIRED =
  'the agent’s label is required — the request log’s caller axis; per-terminal labels are preferred';

/** The dot-segment refusal at an offline mint's door — the wire mint's own words. */
export const DOT_AGENT_REFUSAL =
  '"." and ".." refuse — the wire’s revoke URL (/stores/{name}/grants/{agent}) ' +
  'could never address the grant: take a label it can carry';

/** The mode's grammar, taught where a wrong one arrives. */
export const MODE_TEACHING =
  'the mode is ro or rw — read only, or read and write; changing it is revoke, then mint';

/** The store name's teaching at the doors' shared voice. */
export const STORE_NAME_TEACHING =
  'the store name breaks the grammar — lowercase, starts with a letter, up to 32 characters (a-z, 0-9, dashes)';

/** The mode's two words, and nothing else — the narrowing the mint's type demands. */
export function isGrantMode(value: string | undefined): value is 'ro' | 'rw' {
  return value === 'ro' || value === 'rw';
}
