import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveVersion } from "./version.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const srcDir = fileURLToPath(new URL(".", import.meta.url));
const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const bin = fileURLToPath(new URL("../bin/souvenance.js", import.meta.url));

// --- the helper ---

test("resolveVersion: walks up from src/ to the repo manifest", () => {
  // src/ has no package.json of its own — the walk must reach the repo root
  // and report the version the repo is actually at.
  assert.equal(resolveVersion(srcDir), manifest.version);
});

test("resolveVersion: finds the manifest two levels up (dist-run layout)", () => {
  // Simulates the built/tarball layout dist/bin/souvenance.js: one walk,
  // same answer as the source run.
  const root = mkdtempSync(join(tmpdir(), "souvenance-version-found-"));
  try {
    mkdirSync(join(root, "dist", "bin"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "@souvenance/cli", version: "9.9.9-test" }),
    );
    assert.equal(resolveVersion(join(root, "dist", "bin")), "9.9.9-test");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVersion: a version-less manifest is not ours — the walk continues past it", () => {
  const root = mkdtempSync(join(tmpdir(), "souvenance-version-lesstag-"));
  try {
    mkdirSync(join(root, "deep"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "not-ours" }));
    assert.equal(resolveVersion(join(root, "deep")), "unknown");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVersion: no manifest anywhere up the tree — 'unknown', refuse to lie", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-version-none-"));
  try {
    assert.equal(resolveVersion(dir), "unknown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the CLI contract (the real bin, the expected triple) ---

test("CLI contract: --version prints the version alone, exits 0, stderr noise-only", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-version-flag-"));
  try {
    const result = spawnSync(process.execPath, [bin, "--version"], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, manifest.version + "\n");
    // The known node:sqlite ExperimentalWarning is documented noise
    // (directive: sequential writes); anything else on stderr is a failure.
    const lines = result.stderr.split("\n").filter((l) => l.trim() !== "");
    assert.ok(
      lines.every((l) => /ExperimentalWarning|trace-warnings/.test(l)),
      `stderr must carry only known noise, got: ${JSON.stringify(lines)}`,
    );
    // Interception happens before Store.open: no DB side effect in cwd.
    assert.equal(existsSync(join(dir, ".souvenance")), false, "--version must not create a store");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI contract: the version subcommand is equivalent to the --version flag", () => {
  const dir = mkdtempSync(join(tmpdir(), "souvenance-version-cmd-"));
  try {
    const result = spawnSync(process.execPath, [bin, "version"], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, manifest.version + "\n");
    const lines = result.stderr.split("\n").filter((l) => l.trim() !== "");
    assert.ok(
      lines.every((l) => /ExperimentalWarning|trace-warnings/.test(l)),
      `stderr must carry only known noise, got: ${JSON.stringify(lines)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
