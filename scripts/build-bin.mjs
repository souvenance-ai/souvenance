// Publish-time bin builder (decision 38e8b225): tsc emits dist/src/*.js with
// .ts import extensions rewritten (rewriteRelativeImportExtensions), but the
// repo bin is plain JS untouched by tsc — this script copies it into the
// tarball layout, rewriting its ../src/*.ts imports to ../src/*.js. Fails
// loudly if any TypeScript import survives unrewritten.
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";

const source = readFileSync("bin/souvenance.js", "utf8");
const built = source.replace(/"\.\.\/src\/([^"]+)\.ts"/g, '"../src/$1.js"');

const leftovers = built.match(/"\.\.\/src\/[^"]+\.ts"/g);
if (leftovers) {
  console.error("unrewritten TS imports:", leftovers);
  process.exit(1);
}

mkdirSync("dist/bin", { recursive: true });
writeFileSync("dist/bin/souvenance.js", built);
chmodSync("dist/bin/souvenance.js", 0o755);
console.log("dist/bin/souvenance.js:", built.match(/"\.\.\/src\/[^"]+"/g));
