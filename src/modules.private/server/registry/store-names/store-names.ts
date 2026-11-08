/**
 * The registry's one enumeration: the stores dir's store names — every
 * `*.db` there is a store, no list beside it to drift. One filter, two
 * walkers: the boot's cold-open (asserting each name per its own
 * fail-fast law) and the manager's fork composition (the names as the
 * occupied set). Names arrive WITHOUT their `.db` — the bare grammar's
 * shape the callers speak in.
 */
import { readdirSync } from 'node:fs';

export function storeNames(storesDir: string): readonly string[] {
  const names: string[] = [];
  for (const entry of readdirSync(storesDir)) {
    if (entry.endsWith('.db')) names.push(entry.slice(0, -3));
  }
  return names;
}
