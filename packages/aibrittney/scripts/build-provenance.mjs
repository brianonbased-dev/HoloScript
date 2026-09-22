// Writes dist/BUILD_PROVENANCE.json after tsup so a dist that was copied by
// hand (the Jetson gets its aibrittney this way) can be matched to the commit
// it was built from: { commit, dirty, builtAt, files: { name: sha256 } }.
// `dirty` is true when this package had uncommitted changes at build time —
// then `commit` is only where the build started, not what it contains.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(pkgDir, 'dist');
const OUT = 'BUILD_PROVENANCE.json';

function git(...args) {
  return execFileSync('git', ['-C', pkgDir, ...args], { encoding: 'utf8' }).trim();
}

let commit = 'unknown';
let dirty = null;
try {
  commit = git('rev-parse', 'HEAD');
  dirty = git('status', '--porcelain', '--', '.').length > 0;
} catch {
  // Not a git checkout (an exported tarball): leave commit unknown, dirty null.
}

const files = {};
for (const name of readdirSync(distDir).sort()) {
  if (name === OUT) continue;
  const path = join(distDir, name);
  if (!statSync(path).isFile()) continue;
  files[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
}

const provenance = { commit, dirty, builtAt: new Date().toISOString(), files };
writeFileSync(join(distDir, OUT), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(
  `${OUT}: commit ${commit}${dirty ? ' (dirty)' : ''}, ${Object.keys(files).length} files hashed`
);
