/**
 * The memory filters' shared shape — `list` and `search` ride the same
 * four: --limit, --kind (repeatable, the wire's IN — a lone one is its
 * singleton), --metadata (one JSON document passed through, the wire
 * judges the grammar), --include-terminals (a presence flag). One
 * composition, both actions: the query builder speaks the wire's
 * parameter language once.
 */
export interface MemoryFilterArgs {
  readonly limit?: number;
  readonly kind?: readonly string[];
  readonly metadata?: string;
  readonly includeTerminals?: boolean;
}

/** The filters as the wire's query string — the caller adds its own keys beside them. */
export function filterQuery(args: MemoryFilterArgs): URLSearchParams {
  const query = new URLSearchParams();
  if (args.limit !== undefined) query.set('limit', String(args.limit));
  for (const kind of args.kind ?? []) query.append('kind', kind);
  if (args.metadata !== undefined) query.set('metadata', args.metadata);
  if (args.includeTerminals === true) query.set('include_terminals', '');
  return query;
}
