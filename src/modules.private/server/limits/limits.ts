/**
 * The HTTP limit constants (#19): MAX 1000 dwarfs any real page — bulk
 * reads are the CLI's export verb, not an unbounded remote list — and it
 * judges only an EXPLICIT limit. DEFAULT 100 is the page a request gets
 * when it stays silent (Q18 revised with the dev, 2026-10-28: the
 * unbounded verbatim let the facade's own default truncate silently; an
 * explicit page every time keeps the peek honest). The checkin ritual
 * keeps the facade's verbatim no-cap — order guides attention, nothing
 * drops; its hot sets are curated small.
 */
export const MAX_LIMIT = 1000;
export const DEFAULT_LIMIT = 100;
