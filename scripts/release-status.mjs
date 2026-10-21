#!/usr/bin/env node
// Release-debt detector (spec release-automation, ticket 02): compares HEAD
// against the last v-tag and answers, as JSON, whether a release is staged
// (a version bump sits relative to the last tag) and how many
// package-impacting commits are pending. Humans, the agent and
// release-pr.yml all read the same answer. Status, never alarm — exit 0 in
// every state.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inScope } from "./release-scope.mjs";

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

// Artifact scope lives in release-scope.mjs (shared with pr-check.mjs).

// Last version tag; match v* only (the repo carries a non-version
// `pre-genesis` tag that must never become the baseline).
const lastTag = sh("git", ["tag", "-l", "v*", "--sort=-v:refname"]).split("\n")[0] || "";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const staged = lastTag !== `v${version}`;

// Commits since the last tag — all of them when no v-tag exists yet
// (empty-tree diff as the range base).
const range = lastTag ? `${lastTag}..HEAD` : `${sh("git", ["hash-object", "-t", "tree", "/dev/null"])}..HEAD`;
const commits = sh("git", ["log", "--format=%H %s", range]).split("\n").filter(Boolean);

const pending = commits
  .map((line) => {
    const space = line.indexOf(" ");
    return { hash: line.slice(0, space), subject: line.slice(space + 1) };
  })
  .filter(({ hash }) =>
    sh("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", hash])
      .split("\n")
      .filter(Boolean)
      .some(inScope),
  )
  .map(({ hash, subject }) => ({ hash: hash.slice(0, 7), subject }));

// One patch bump of the CURRENT version — a proposal for the release PR;
// the level is decided inside that PR, never guessed here.
const [maj, min, pat] = version.split(".").map(Number);
const suggested = `${maj}.${min}.${pat + 1}`;

process.stdout.write(
  JSON.stringify(
    {
      last_tag: lastTag || null,
      version,
      staged, // a bump exists relative to the last tag → publish underway (leg 1)
      pending_commits: pending.length,
      commits: pending.map((c) => `${c.hash} ${c.subject}`),
      suggested_version: suggested,
    },
    null,
    2,
  ) + "\n",
);
