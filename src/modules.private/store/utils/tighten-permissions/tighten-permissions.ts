/**
 * Tightens a store file and its WAL sidecars to owner-only permissions.
 * The store IS the agent's identity (directives, decisions, transcripts) —
 * the same argument that makes a group-readable token file a refusal
 * applies to the store file. Best-effort: a failed chmod never bricks the
 * open; the checkout's file_permissions check is the visible enforcer for
 * anything this pass cannot reach (win32 skipped — stat mode is unreliable).
 */
import { chmodSync, existsSync } from 'node:fs';
import { sidecarPaths } from '../sidecar-paths/sidecar-paths.ts';

export function tightenPermissions(dbPath: string): void {
  if (process.platform === 'win32') return;
  for (const path of sidecarPaths(dbPath)) {
    try {
      if (existsSync(path)) chmodSync(path, 0o600);
    } catch {
      // best effort — checkout's file_permissions check reports drift
    }
  }
}
