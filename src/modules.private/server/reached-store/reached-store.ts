/**
 * The store a data route serves, once the grant's reach is checked: a
 * foreign store refuses 403 BEFORE existence is spoken — the registry's
 * contents are not a foreign grant's business (Q8: the reach is 403,
 * the unknown is 404, in that order). The management gate mounts in the
 * assembly; this is the data routes' own door.
 */
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { Store } from '../../store/store.ts';
import { StoreError } from '../../store/store-error/store-error.ts';
import { grantReaches, type ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';

export function reachedStore(c: Context<ServerEnv>, registry: Registry, name: string): Store {
  const grant = c.get('grant');
  if (!grantReaches(grant, name)) {
    throw new HTTPException(403, {
      message: `this grant reaches store "${grant.store}" only — "${name}" is foreign`,
    });
  }
  const store = registry.get(name);
  if (store === undefined) {
    throw new StoreError('not_found', `no store "${name}" in the registry`);
  }
  return store;
}
