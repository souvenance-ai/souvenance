/**
 * The one error→status mapping: `onError` serves it on the wire and the
 * opt-in request log (#69) reads it while the error is still in flight —
 * the log's line must carry the status the response will carry, and two
 * mappings would drift. Precedence matches the wire: a Hono HTTPException
 * (the data routes' reach refusals) carries its own status; a StoreError
 * maps by code — `read_only` is the manager's case, never served; a
 * non-StoreError is an internal error and lands on 500 (the wire never
 * discloses — #19).
 */
import { HTTPException } from 'hono/http-exception';
import { StoreError } from '../../store/store-error/store-error.ts';

/** The status a StoreError code maps to; read_only is the manager's case, never served. */
const STATUS_BY_CODE: Record<StoreError['code'], 400 | 404 | 409 | 503 | 500> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
  busy: 503,
  read_only: 500,
};

export type ErrorStatus = 400 | 403 | 404 | 409 | 500 | 503;

export function errorStatus(err: unknown): ErrorStatus {
  if (err instanceof HTTPException) return err.status as ErrorStatus;
  if (err instanceof StoreError) return STATUS_BY_CODE[err.code];
  return 500;
}
