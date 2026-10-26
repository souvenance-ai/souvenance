/**
 * The db file and its WAL sidecars — the trio every permission pass and a
 * forced fork refresh must treat together.
 */
export function sidecarPaths(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}
