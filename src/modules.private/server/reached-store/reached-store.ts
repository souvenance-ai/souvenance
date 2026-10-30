/**
 * The data routes' doors (#63). `reachedStore`: the store a read serves,
 * once the credential's family and reach are checked — a management
 * grant refuses 403 (it reaches no store's data), a foreign store
 * refuses 403 BEFORE existence is spoken, the registry's contents are
 * not a foreign grant's business (Q8: the reach is 403, the unknown is
 * 404, in that order). `writableStore`: the write routes' door — the
 * family and reach gates via reachedStore, then the mode gate, in that
 * order, structurally; the gate sequence the write module's header
 * documents is this one call. The management gate mounts in the
 * assembly; these are the data routes' own doors.
 */
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { Store } from '../../store/store.ts';
import { StoreError } from '../../store/store-error/store-error.ts';
import { isStoreGrant, type ServerEnv } from '../auth/auth.ts';
import type { Registry } from '../registry/registry.ts';

export function reachedStore(c: Context<ServerEnv>, registry: Registry, name: string): Store {
  const grant = c.get('grant');
  if (!isStoreGrant(grant)) {
    throw new HTTPException(403, {
      message: 'a management grant reaches no store data — the data surface wants a store grant',
    });
  }
  if (grant.store !== name) {
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

export function writableStore(c: Context<ServerEnv>, registry: Registry, name: string): Store {
  const store = reachedStore(c, registry, name);
  const grant = c.get('grant');
  if (isStoreGrant(grant) && grant.mode !== 'rw') {
    throw new HTTPException(403, {
      message: 'this grant is read-only — writes need a grant with mode rw',
    });
  }
  return store;
}
