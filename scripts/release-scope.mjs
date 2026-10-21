/**
 * The artifact scope — the single source shared by the release detector
 * (release-status.mjs) and the PR release check (pr-check.mjs). It is the
 * publish whitelist shape: everything that ends up in the tarball or shapes
 * it. src/ includes the shipped tests (decision c9fb7125, re-confirmed
 * c6914b23). Publish plumbing (.github/), docs, scratch and skills are
 * excluded — a workflow edit is not a package change.
 */
export const SCOPE = [
  "src/",
  "bin/",
  "scripts/build-bin.mjs",
  "tsconfig.build.json",
  "package.json",
  "README.md",
  "LICENSE",
];

export const inScope = (file) => SCOPE.some((s) => file === s || file.startsWith(s));
