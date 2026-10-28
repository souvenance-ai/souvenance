/**
 * The HTTP limit cap (#19): 1000 dwarfs any real page; bulk reads are
 * the CLI's export verb, not an unbounded remote list. The cap judges
 * only an EXPLICIT limit (Q18) — absent stays the facade's verbatim
 * "serve everything"; the cursor bounds each hop client-side.
 */
export const MAX_LIMIT = 1000;
