import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Resolve the CLI version from the nearest package.json, walking up from
 * startDir (spec cli-version-flag, 2026-10-21): one walk covers every run
 * mode — source run (bin/souvenance.js → one level up), built dist and npm
 * tarball (dist/bin/souvenance.js → two levels up; package.json rides in
 * every tarball regardless of the files whitelist). A manifest without a
 * version string is not our manifest — the walk continues past it. Returns
 * "unknown" when none is found: refuse to lie.
 */
export function resolveVersion(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (typeof manifest.version === "string" && manifest.version.length > 0) {
        return manifest.version;
      }
    } catch {
      // no manifest here (missing or unreadable) — keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) return "unknown"; // filesystem root reached
    dir = parent;
  }
}
