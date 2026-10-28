/**
 * The cursor token (#40): the facade's `{created_at, id}` keyset key
 * wrapped in an opaque base64url token. Opaque on purpose — the client
 * takes `next_after` from the previous page and hands it back untouched;
 * nothing else about the serving order is contract. Zod owns the shape
 * check and it is STRICT: a token carrying more than the keyset key (the
 * whole node, once a draft's mistake) is not ours — `undefined`, and the
 * route teaches (400).
 */
import { z } from 'zod';
import type { ListCursor } from '../../store/store.ts';

const CursorSchema = z.object({ created_at: z.string(), id: z.string() }).strict();

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
  const result = CursorSchema.safeParse(decoded);
  return result.success ? result.data : undefined;
}
