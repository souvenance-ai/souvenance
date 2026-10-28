/**
 * The cursor token (#40): the facade's `{created_at, id}` keyset key
 * wrapped in an opaque base64url token. Opaque on purpose — the client
 * takes `next_after` from the previous page and hands it back untouched;
 * nothing else about the serving order is contract. Anything that does
 * not decode back into the exact shape is not ours: `undefined`, and the
 * route teaches (400).
 */
import type { ListCursor } from '../../store/store.ts';

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(token: string): ListCursor | undefined {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (typeof decoded !== 'object' || decoded === null) return undefined;
  const candidate = decoded as { created_at?: unknown; id?: unknown };
  if (typeof candidate.created_at !== 'string' || typeof candidate.id !== 'string') {
    return undefined;
  }
  return { created_at: candidate.created_at, id: candidate.id };
}
