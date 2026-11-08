/**
 * The registry's one file law: a store named `name` lives as
 * `<name>.db` beside its peers (the GLOSSARY's Registry — nothing is
 * declared, every file is a store). One join, three callers today: the
 * registry's claim ceremony (boot, create, fork), the grant family's
 * existence gate, and the fork's source and target paths.
 */
import { join } from 'node:path';

export function storeDbPath(storesDir: string, name: string): string {
  return join(storesDir, `${name}.db`);
}
