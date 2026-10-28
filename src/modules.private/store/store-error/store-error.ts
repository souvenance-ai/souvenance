/**
 * The store's typed refusals (#20): every throw the facade and its utils
 * raise carries a code alongside its message, so a consumer maps refusals
 * to its own vocabulary honestly — the HTTP server keys statuses on the
 * code, never on regex over message text across a module boundary (the
 * v0.1 mapping dies with this). The messages keep their teaching voice:
 * the code classifies, the message teaches.
 *
 *   not_found — the addressed thing does not exist (HTTP 404)
 *   conflict  — it exists but the request fights its state (409)
 *   invalid   — the request itself is malformed (400)
 *   busy      — SQLITE_BUSY survived every retry (503, retry later)
 *   read_only — a write hit a read-only open; the server never opens
 *               read-only, the manager's offline verbs do
 */
export type StoreErrorCode = 'not_found' | 'conflict' | 'invalid' | 'busy' | 'read_only';

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}
