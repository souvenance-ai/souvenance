#!/usr/bin/env node
// PR release check (release regime, ticket 03): fails a pull request that
// touches the artifact scope without carrying its own package.json bump.
// The bump-in-PR is the release moment governance — a bump forgotten means
// a release silently skipped; this check makes the omission loud instead.
// Env (provided by release-check.yml): BASE_SHA, HEAD_SHA. Reads both
// revisions of package.json straight from git — no working tree involved.
// Exit 1 = missing bump; the check output carries the why.
import { execFileSync } from "node:child_process";
import { inScope } from "./release-scope.mjs";

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

const { BASE_SHA, HEAD_SHA } = process.env;
if (!BASE_SHA || !HEAD_SHA) {
  console.error("BASE_SHA and HEAD_SHA are required (release-check.yml provides them)");
  process.exit(1);
}

const versionAt = (sha) =>
  JSON.parse(sh("git", ["show", `${sha}:package.json`], )).version;

const baseVersion = versionAt(BASE_SHA);
const headVersion = versionAt(HEAD_SHA);

const files = sh("git", ["diff", "--name-only", `${BASE_SHA}..${HEAD_SHA}`])
  .split("\n")
  .filter(Boolean);
const scopeFiles = files.filter(inScope);
const scoped = scopeFiles.length > 0;
const bumped = headVersion !== baseVersion;

const verdict = !scoped
  ? "pass: no artifact-scope change — no release owed"
  : bumped
    ? `pass: artifact-scope change with a bump — merge publishes ${headVersion}`
    : `fail: artifact-scope change without a bump — add a package.json bump commit (currently ${baseVersion} on both sides), or the release is silently skipped`;

process.stdout.write(
  JSON.stringify({ base: baseVersion, head: headVersion, scoped, bumped, scope_files: scopeFiles, verdict }) + "\n",
);
if (scoped && !bumped) {
  console.error(verdict);
  process.exit(1);
}
