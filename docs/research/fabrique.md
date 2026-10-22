# Research: fabrique conventions (barrel, `.private`, dist, workflows)

Resolves wayfinder ticket #15 (`wayfinder:research`).

**Evidence base**: the installed package `node_modules/fabrique/` (fabrique `2.0.21`, npm, MIT, author Valentin Richard, repo `github.com/lifaon74/fabrique` — see `node_modules/fabrique/package.json`). Every claim below cites the exact source file inside the package. The package ships compiled JS (`src/**/*.js` + `.d.ts`), not TS, and its own internal folders use the same `.private` suffix convention it documents for consumers.

---

## 1. What `fb:build` (`fabrique build`) generates

Entry: `node_modules/fabrique/src/cli/actions.private/build-project/build-project.js`.

Pipeline (verbatim order, from `build-project.js` and `node_modules/fabrique/src/helpers.private/build/typescript/build-typescript-project.js`):

1. **Deletes `dist/`** (`rm -rf`, line 11–14 of `build-project.js`).
2. **Generates a temporary barrel** `src/index.ts` from `buildTypescriptIndexFile` (see §2). The file is **temporary**: `build-typescript-project.js` lines 25 & 36 `stack.defer(() => rm(absoluteIndexFilePath))` — it is removed after the build. **Never commit `src/index.ts`; a committed copy is silently overwritten at build time and deleted afterwards.** (`writeFileSafe` in `node_modules/fabrique/src/helpers.private/file/write-file-safe.js` is a plain `mkdir` + `writeFile`, no conflict warning.)
3. Optionally generates `src/index.protected.ts` the same way (only if ≥ 1 protected file exists).
4. **Writes a temporary `tsconfig.build.json`** (lines 39–53 of `build-typescript-project.js`): `{ extends: './tsconfig.json', compilerOptions: { declaration: true, declarationDir: 'dist', rootDir: '.', outDir: 'dist' }, include: ['src/index.ts' (+ 'src/index.protected.ts')] }` — then removed after build. Note `include` lists **only the barrel files**: the compiled output contains exactly the files transitively imported from `src/index.ts` (and `src/index.protected.ts`). Files not reachable from the barrels — all `*.test.ts`, all `.private` files — are **not compiled into dist at all**.
5. **Runs `tsc -p ./tsconfig.build.json`** (line 55). Resulting layout: `dist/src/index.js`, `dist/src/index.js.map`, `dist/src/index.d.ts`, plus one `.js`/`.js.map`/`.d.ts` triplet per transitively reachable module (e.g. `src/modules/foo.ts` → `dist/src/modules/foo.js`).
6. **Writes `dist/package.json`** — a rewritten copy of the root `package.json` (§1.2).
7. **Copies published extras into `dist/`**: `README.md`, `CONTRIBUTING.md`, `LICENSE`, and the whole `static/` directory if present (warn+skip if missing) — `node_modules/fabrique/src/helpers.private/build/other-files/copy-other-package-files.js`. So a repo-level `static/` directory is the convention for extra published assets.

`--mode` affects only the version string (`node_modules/fabrique/src/helpers.private/build/package-json/generate-package-json-build-version/generate-package-json-build-version.js`): `prod` keeps the version verbatim; `dev`/`rc` produce `{version}-dev.{prerelease ?? Date.now()}` / `{version}-rc.{prerelease ?? Date.now()}`. A version containing `-` is rejected. `--output` (default `dist`) and `fabrique.type` (`package.json` `fabrique.type ?? 'lib'`, only `lib` supported) come from `build-project.js` line 16.

### 1.1 Barrel generation (`src/index.ts` / `src/index.protected.ts`)

Source: `node_modules/fabrique/src/helpers.private/build/typescript/build-typescript-index-file.js`.

- **Public barrel** (`type: 'public'`): glob `src/**/*.ts`, excluding `src/**/*.{test,spec,bench,protected,private}.ts` and `src/**/*.{test,spec,bench,protected,private}/**/*.ts`. Emits one `export * from './<relative path>'` per remaining file (relative to `src`). If nothing matches, the function returns `null` and `buildTypescriptProject` **throws `'Empty public typescript index file.'`** (`build-typescript-project.js` line 22) — a project whose every source file is private/test cannot build.
- **Protected barrel** (`type: 'protected'`): glob `src/**/*protected.ts` + `src/**/*.protected/**/*.ts`, excluding `src/**/*.{test,spec,bench,private}.ts` and directories. Note the glob is `*protected.ts`, not `.protected.ts` — any file name ending in `protected` is swept in.

### 1.2 How `dist/package.json` is rewritten

Sources: `node_modules/fabrique/src/helpers.private/build/package-json/generate-build-package-json-file/typescript/generate-typescript-build-package-json-file.js` (called with the temporary `src/index.ts` path) and `.../generate-build-package-json-file/generate-build-package-json-file.js`.

- `main` = the index path with `.ts` → `.js` (`src/index.ts` → `src/index.js`, i.e. `dist/src/index.js` relative to the package root; written into `dist/package.json` where `src/index.js` is correct).
- `types` = the index path with `.ts` → `.d.ts` (`src/index.d.ts`).
- `exports` is **always overwritten** with:
  ```json
  {
    ".":      { "types": "src/index.d.ts", "default": "src/index.js" },
    "./protected": { "types": "src/index.protected.d.ts", "default": "src/index.protected.js" }  // only if protected files exist
  }
  ```
  (`.ts`→`.js`/`.d.ts` replacement handles arbitrary nested export shapes, but the generated top-level value replaces whatever the source `package.json` had.)
- `bin`, `module` keep their source values with `.ts` → `.js`.
- **Only these fields survive** into `dist/package.json`: `name`, `version` (mode-adjusted), `type`, `description`, `keywords`, `author`, `license`, `repository`, `main`, `bin`, `module`, `types`, `exports`, `dependencies`, `peerDependencies`, `optionalDependencies` (`generate-build-package-json-file.js` lines 5–28). **Everything else is dropped**: `scripts`, `packageManager`, `devDependencies`, `engines`, `access`, etc. (`--access public` is passed explicitly to `npm publish`, §4.)

**Consequence (the actual visibility contract):** the barrel *is* the public API. Consumers can import only what `exports` allows — the root barrel (and `./protected`). Subpath imports like `souvenance/modules/foo` are unreachable in the published package unless exported transitively through the barrel.

---

## 2. `.private` and `.protected` suffixes

Documented in `node_modules/fabrique/README.md` ("build" section, lines 126–141) and implemented in `build-typescript-index-file.js`:

| Suffix | Effect |
|---|---|
| `*.private.ts` / `*.private/` | **Fully excluded** from the public barrel and from compilation — invisible in the published package, unless transitively imported by a public file. |
| `*.protected.ts` / `*.protected/` | Excluded from the public barrel, exported via the separate `src/index.protected.ts` barrel, published as the `./protected` subpath (`import * from '<pkg>/protected'`). Not generated at all if no protected files exist. |
| `*.test.ts` / `*.spec.ts` / `*.bench.ts` (and dirs `*.test/` etc.) | Excluded from both barrels; not compiled into dist. Tests run via `fb:test` from source, never from dist. |

Notable: fabrique itself applies the convention to non-TS assets too — the template contains `src/style.scss` vs `src/style.private.scss` (`node_modules/fabrique/static/templates/lib/src/`).

---

## 3. Expected module layout conventions

From the create/upgrade template `node_modules/fabrique/static/templates/lib/`:

```
package.json            # fb:* scripts, "fabrique": { "version", "type": "lib" }
tsconfig.json           # include: ["src/**/*.ts"], strict ESNext/NodeNext, declaration: false
vitest.config.ts        # see §7
.yarnrc.yml             # nodeLinker: node-modules, yarnPath: .yarn/releases/yarn-4.18.1.cjs, npmPreapprovedPackages: [fabrique]
.nvmrc                  # v24
.prettierrc             # singleQuote, printWidth 100, prettier-plugin-organize-imports
.editorconfig           # LF, 2 spaces
.github/workflows/{pr-code-quality,release,auto-assign-author-and-reviewers}.yml
.github/auto_assign.yml
.yarn/releases/yarn-4.18.1.cjs
fabrique/test/tools.ts  # fabrique-owned test helpers (TestTools.sleep / polyfillRequestIdleCallback / gc)
src/add.ts              # public module (exported via barrel)
src/add.test.ts         # test next to the module, same dir
src/sub.private.ts      # private module (template shows the suffix convention)
src/main.ts             # dev entrypoint script (imports './add.ts' with extension — allowImportingTsExtensions)
static/                 # (optional) copied verbatim into dist/ by fb:build
```

Layout rules of thumb: all buildable code lives in `src/`; tests sit next to the code they test; anything that must not be published gets the `.private` suffix (file or directory); `fabrique/test/tools.ts` is the shared test-helper home; the dev CLI entrypoint is a plain script (`src/main.ts` in the template, `src/cli/cli.ts` in souvenance) and is *not* special-cased by the build beyond being part of `src/**`.

`tsconfig.json` template (`static/templates/lib/tsconfig.json`): `strict`, `NodeNext`, `allowImportingTsExtensions: true`, `rewriteRelativeImportExtensions: true`, `verbatimModuleSyntax: true`, `include: ["src/**/*.ts"]` — so **relative imports in source use explicit `.ts` extensions** (`import { add } from './add.ts'`), and `fb:check:types` (`tsc -p tsconfig.json --noEmit`) typechecks the whole `src/` including tests.

---

## 4. `fb:release` / `fb:ci:release` behavior

### `fb:release` (`fabrique release`) — source `node_modules/fabrique/src/cli/actions.private/release-project/release-project.js`

In order (lines 13–66):

1. **Test gate**: runs `yarn run fb:test` if a `fb:test` script exists, else `yarn run test`; if neither, logs `'SKIP (non-blocking): test script not found.'` and **continues** (test gate only exists when a test script exists). Build failure (exit ≠ 0) aborts the release via `ExecCommandError`.
2. **Build**: `yarn run fb:build --mode <mode> --output dist` if present, else `yarn run build --…`, else internal `buildProject()`.
3. **Already-published guard**: reads `dist/package.json`, `parseSemverStrict` on the final version, and `HEAD https://registry.npmjs.org/<name>/<major>.<minor>.<patch>` (`node_modules/fabrique/src/helpers.private/npm/is-npm-version-published/is-npm-package-published.js`). If 200 → `throw 'Package <name>@<base> already exists on npm.'`. **The check is against the base version with the prerelease stripped** — so dev/rc releases of a base version that was ever published are blocked too; bump `package.json#version` before every release.
4. **Publish**: `npm publish --access public [--tag <tag>]` executed **from `dist/`**. Tag per mode (`node_modules/fabrique/src/helpers.private/release/release-mode/release-mode-to-npm-tag.js`): `dev` → `dev`, `rc` → `rc`, `prod` → `latest` (no `--tag` flag for latest — only `--access public`).
5. **Git tag `v<version>`**: code path present but commented out — `"TODO => add tag support"` (lines 67–87). No tags are created today.
6. `--dry` / `CI_RELEASE_DRY_RUN`: skips the actual `npm publish` and git tag, logs `(dry) …` instead.

### `fb:ci:release` (`fabrique ci release`) — source `node_modules/fabrique/src/cli/actions.private/ci-workflow/ci-workflow.js`

- Loads `.env` first (`loadOptionallyEnvFile`) — note the path quirk: `ENV_FILE_PATH` resolves to **`node_modules/fabrique/.env`**, not the project root (`node_modules/fabrique/src/helpers.private/env/env-file/env-file-path.js`).
- Reads CI context from env var **`GITHUB_CI_CONFIG`** (a JSON object; the workflow supplies `${{ toJson(github) }}`). Only `pull_request` and `push` events are supported, and only branches `main` / `develop` (throws otherwise).
- **Release matrix** (`inferCiReleaseContext`, lines 35–67):
  - `pull_request` targeting `main`/`develop`: mode **`dev`**; publishes **only if the PR carries the label `dev`** — otherwise logs `'SKIP: CI release disabled for …(missing required PR label "dev")'` and exits 0.
  - `push` to `develop`: mode **`rc`**, always releases.
  - `push` to `main`: mode **`prod`**, always releases.
- Publish happens via the same `releaseProject` (test gate + build + guard + `npm publish`). No OIDC logic inside fabrique itself — OIDC is set up by the GitHub workflow (§5) and by `setup-node` with `registry-url`; the `npm` CLI ≥ 9.5 does the `id-token` exchange itself.

---

## 5. Where `.github/workflows/*` come from

**They are fabrique-owned templates**, shipped inside the npm package:

- `node_modules/fabrique/static/templates/lib/.github/workflows/pr-code-quality.yml`
- `node_modules/fabrique/static/templates/lib/.github/workflows/release.yml`
- `node_modules/fabrique/static/templates/lib/.github/workflows/auto-assign-author-and-reviewers.yml`

Both consumed-repo workflows (`souvenance/.github/workflows/pr-code-quality.yml`, `release.yml`) are byte-identical to these templates (diff shows only CRLF/LF line-ending difference).

- `fabrique create` copies the template tree into the new project (`node_modules/fabrique/src/cli/actions.private/create-project/create-project.js`, `cp(templateDirectory, projectDirectory, { recursive: true })`).
- **`fabrique upgrade` re-copies them and overwrites the repo's copies** — `node_modules/fabrique/src/cli/actions.private/upgrade-project/upgrade-project.js`, `upgradeProjectFiles()`: the glob excludes only `src/**/*`, `README.md`, `LICENSE`, `package.json`, `yarn.lock`, `.github/auto_assign.yml` (lines 99–108) — `.github/workflows/*`, `.yarnrc.yml`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc`, `.nvmrc`, `fabrique/` are **all overridden** (each logged as `override: <path>`), and it also wipes and regenerates `.yarn/`, `fabrique/`, `tsconfig.build.json`, `.env.example`, then `git add -A` (line 78).
- So: **do not hand-edit `pr-code-quality.yml` / `release.yml`** — the next `fb:upgrade` silently reverts the edits. Add a *new, differently-named* workflow file instead; extra files not present in the template are left untouched by upgrade.

### Template `release.yml` content (contract for the release pipeline)

`on`: push to `main`/`develop`, and PRs targeting `main`/`develop` (opened/reopened/synchronize/labeled/unlabeled). Job permissions: `id-token: write  # Required for OIDC`, `contents: read`. Steps: checkout (fetch-depth 0), corepack enable, setup-node@v7 (node 24, `registry-url: 'https://registry.npmjs.org'`, cache yarn), `yarn install --immutable`, then:

- Same-repo PR **with label `dev`** → `yarn fb:ci:release` (real publish) with `GITHUB_CI_CONFIG: ${{ toJson(github) }}`.
- Fork PR with label `dev` → dry-run variant (`CI_RELEASE_DRY_RUN: 'true'` — parsed via zod `z.boolean()` from JSON env, so `'true'`/`true` work).
- Same-repo PR without `dev` label → the step's `if` is false and `fb:ci:release` never runs at workflow level (fabrique's internal skip is the belt-and-braces path).

### Template `pr-code-quality.yml` content (contract for PR CI)

`on`: PR opened/reopened/ready_for_review/synchronize, `concurrency` cancel-in-progress per PR, skip drafts, then: checkout, corepack, setup-node (node 24, cache yarn), `yarn install --immutable`, `yarn fb:check`. **Nothing else.** Since `fb:check = fb:check:types (tsc --noEmit) + fb:format:check (prettier)` per the template `package.json` (`static/templates/lib/package.json` lines 17–18), **PR CI runs no tests**.

---

## 6. Vitest configuration

`node_modules/fabrique/static/templates/lib/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,bench}.ts',
        'src/**/*.skip-test*.ts',
        'src/**/*.skip-test*/**/*.ts',
      ],
    },
  },
});
```

`souvenance/vitest.config.ts` is **byte-identical** to this template — it is exactly the fabrique-blessed shape. Tests live under `src/` (hence `dir: 'src'`), tests are excluded from coverage, and `*.skip-test*` files/dirs are an additional convention to opt files out of test runs. The template's `fb:test` is `vitest run`, `fb:test:coverage` `vitest run --coverage`, `fb:bench` `vitest bench`.

---

## 7. Is there a config knob to run tests in PR CI?

**No.**

- The entire fabrique configuration surface is `package.json#fabrique` = `{ version: string, type: string }` — `node_modules/fabrique/src/helpers.private/fabrique/fabrique-config.schema.js`. No knobs for tests, CI, or workflows.
- The template `pr-code-quality.yml` runs only `yarn fb:check`; no template or code path includes tests in PR CI. The test gate exists solely in the release path (`fb:test` before publish, §4) and in the release workflow for labeled PRs (`fb:ci:release` → `releaseProject` → test step).
- A grep of the package for `pr-code-quality` finds only the template file itself; there is no generation/customization logic beyond `create`/`upgrade` file copying.

**Blessed way to get tests into PR CI**: add a separate workflow (e.g. `.github/workflows/pr-tests.yml`) mirroring the template's setup steps and running `yarn fb:test`. Do **not** modify the template-owned workflows (upgrade clobbers them), and do not name your script `fb:*` in `package.json` — `upgradeProjectPackage()` (lines 126–128) treats every script key starting with `fb:` (or `=== FB:`) as fabrique-owned and **drops custom ones** on the next upgrade (custom scripts must be `fb:`-free and land under the `=== FB: CUSTOM SCRIPTS ===` section).

---

## 8. Souvenance-specific observations (release/0.2.0 as of 2026-10-22)

- `package.json#main`/`#bin` = `src/cli/cli.ts` → dist gets `main`/`bin` = `src/cli/cli.js` (= `dist/src/cli/cli.js`), fine; but `exports` will be **overwritten** with the two-entry barrel map, so the published package exposes exactly the barrel (plus `./protected` if any `.protected` files exist).
- Current `src/` has no public code other than `src/cli/cli.ts`; `src/cli/actions.private/serve/serve.ts` is excluded from the barrel and dist, and `src/legacy/**` (except its `*.test.ts`) **would be swept into the public barrel by `fb:build`** as-is — the restructure must move/rename anything that must not be published (`.private` suffix or removal) before the first published build.
- `fb:run` / `fb:link` custom scripts in souvenance's `package.json` start with `fb:` and are **not** in the fabrique template → they will be silently dropped on the next `fabrique upgrade`.
- `engines` and `access` from the root `package.json` do not survive into `dist/package.json` (§1.2) — acceptable since publish uses `--access public`, but worth knowing if engine pinning matters to consumers.
- `fabrique upgrade` also regenerates `fabrique/test/tools.ts`, `.yarnrc.yml`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc`, `.nvmrc` from the template — treat all of these as fabrique-owned; keep repo-specific tsconfig/vitest deviations out of these files (extend via separate configs instead).
