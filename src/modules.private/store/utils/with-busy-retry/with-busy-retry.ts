/**
 * Runs an operation that may hit SQLITE_BUSY under concurrent WAL
 * access, retrying with a short synchronous delay until BUSY_RETRIES is
 * exhausted. Store-only by consumption — every transaction and every
 * racing write passes through here; the store's concurrency contract
 * (#11) rides on this one loop.
 */
const SQLITE_BUSY = 5;
const BUSY_RETRIES = 50;
const BUSY_DELAY_MS = 20;

export function withBusyRetry<GOutput>(operation: () => GOutput): GOutput {
  let lastError: unknown;
  for (let attempt = 0; attempt < BUSY_RETRIES; attempt++) {
    try {
      return operation();
    } catch (err) {
      if (
        err instanceof Error &&
        'errcode' in err &&
        (err as { errcode: number }).errcode === SQLITE_BUSY
      ) {
        lastError = err;
        // Synchronous sleep on purpose: the retry must stay sync —
        // an async sleep would change every caller's contract.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, BUSY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
