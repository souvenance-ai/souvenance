/**
 * Every byte of a payload lands before the write settles: `writeSync`
 * answers only the bytes it actually wrote and may stop short (a full
 * disk partway through the document), and a caller that ignores the
 * count fsyncs and renames a truncated file over the truth — the route
 * reports success while the content on disk is not what was authored.
 * The loop replays `write` with a byte offset into the payload's
 * utf8 buffer until the descriptor has taken all of it; an answer that
 * stops making progress (zero or negative) refuses rather than spin.
 */
import { writeSync } from 'node:fs';

export function writeAllBytes(
  fd: number,
  payload: string,
  write: (buffer: Buffer, offset?: number) => number = (buffer, offset) =>
    writeSync(fd, buffer, offset),
): void {
  const bytes = Buffer.from(payload, 'utf8');
  let landed = 0;
  while (landed < bytes.length) {
    const written = write(bytes, landed);
    if (written > 0) {
      landed += written;
      continue;
    }
    throw new Error(
      `the write answers no progress (${written} bytes after ${landed} landed) — the loop would never finish`,
    );
  }
}
