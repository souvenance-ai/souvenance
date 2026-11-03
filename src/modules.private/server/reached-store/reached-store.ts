/**
 * The data routes' doors (#63, #74). `reachedStore`: the store a read
 * serves — the grant IS the address (ADR 0007): the credential pins the
 * store, no path segment carries it. The family gate refuses a
 * management grant 403 (it reaches no store's data), then the registry
 * speaks existence: an orphaned grant — its store deleted mid-run by
 * management — serves 404, the one existence answer left. `writableStore`:
 * the write routes' door — the family and existence gates via
 * reachedStore, then the mode gate, in that order, structurally; the
 * gate sequence the write module's header documents is this one call.
 * The management gate mounts in the assembly; these are the data
 * routes' own doors.
 */
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { Store } from '../../store/store.ts';
import { StoreError } from '../../store/store-error/store-error.ts';
import { isStoreGrant, type ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';

export function reachedStore(c: Context<ServerEnv>, registry: Registry): Store {
  const grant = c.get('grant');
  if (!isStoreGrant(grant)) {
    throw new HTTPException(403, {
      message: 'a management grant reaches no store data — the data surface wants a store grant',
    });
  }
  const store = registry.get(grant.store);
  if (store === undefined) {
    throw new StoreError('not_found', `no store "${grant.store}" in the registry`);
  }
  return store;
}

export function writableStore(c: Context<ServerEnv>, registry: Registry): Store {
  const store = reachedStore(c, registry);
  const grant = c.get('grant');
  if (isStoreGrant(grant) && grant.mode !== 'rw') {
    throw new HTTPException(403, {
      message: 'this grant is read-only — writes need a grant with mode rw',
    });
  }
  return store;
}
