/**
 * The HTTP caps (#19): MAX_LIMIT 1000 dwarfs any real page — bulk reads
 * are the CLI's export verb, not an unbounded remote list — and it
 * judges only an EXPLICIT limit. DEFAULT_LIMIT 100 is the page a request
 * gets when it stays silent (Q18 revised with the dev, 2026-10-28: the
 * unbounded verbatim let the facade's own default truncate silently; an
 * explicit page every time keeps the peek honest). The checkin ritual
 * keeps the facade's verbatim no-cap — the 1000 ceiling is list/search's
 * alone; the 400 it taught on an explicit checkin limit was a refusal
 * the facade never had (#50). MAX_DEPTH caps the projection walk at the
 * wire: the facade leaves the pace to its in-process caller, and over
 * HTTP the caller is remote — one more non-config constant in this
 * family.
 */
export const MAX_LIMIT = 1000;
export const DEFAULT_LIMIT = 100;
/** The wire ceiling on get's projection depth (the facade needs no cap; the wire does, #50). */
export const MAX_DEPTH = 4;
