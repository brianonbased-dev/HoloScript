#!/usr/bin/env node
// Fails if a package's packed tarball (npm pack --dry-run) lacks any file its
// package.json declares as an entry: main, module, types, bin, exports targets.
// Usage: node scripts/check-packed-entry.mjs <packageDir> [...more]
// Run after the package is built.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root from this script's own location, so the check works from the repo
// root, the package dir, or pnpm --filter.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Absolute paths as given; relative paths against the repo root (falling back
// to cwd if that does not exist).
export function resolvePackageDir(d) {
  if (isAbsolute(d)) return d;
  const fromRoot = resolve(repoRoot, d);
  if (existsSync(join(fromRoot, 'package.json'))) return fromRoot;
  return resolve(process.cwd(), d);
}

function declaredEntries(pkg) {
  const out = new Set();
  const add = (p) => typeof p === 'string' && !p.includes('*') && out.add(posix.normalize(p.replace(/^\.\//, '')));
  add(pkg.main); add(pkg.module); add(pkg.types); add(pkg.typings);
  if (typeof pkg.bin === 'string') add(pkg.bin);
  else if (pkg.bin) Object.values(pkg.bin).forEach(add);
  const walk = (e) => {
    if (typeof e === 'string') add(e);
    else if (e && typeof e === 'object') Object.values(e).forEach(walk);
  };
  walk(pkg.exports);
  return [...out];
}

function packedFiles(dir) {
  const json = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    // npm is npm.cmd on Windows; it needs a shell there. Args are fixed literals.
    shell: process.platform === 'win32',
  });
  return new Set(JSON.parse(json)[0].files.map((f) => posix.normalize(f.path)));
}

export function checkPackedEntry(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const files = packedFiles(dir);
  const missing = declaredEntries(pkg).filter((e) => !files.has(e));
  return { name: pkg.name, version: pkg.version, files: [...files].sort(), missing };
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) { console.error('usage: check-packed-entry.mjs <packageDir>...'); process.exit(2); }
let failed = false;
for (const d of dirs) {
  const dir = resolvePackageDir(d);
  const r = checkPackedEntry(dir);
  if (r.missing.length) {
    failed = true;
    console.error(`FAIL ${r.name}@${r.version}: packed tarball lacks declared entr${r.missing.length > 1 ? 'ies' : 'y'}: ${r.missing.join(', ')}`);
  } else {
    console.log(`OK ${r.name}@${r.version}: all declared entries present (${r.files.length} files)`);
  }
}
process.exit(failed ? 1 : 0);
