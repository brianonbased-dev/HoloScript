#!/usr/bin/env node
/**
 * publish-peer-dep-fix.mjs
 *
 * Publishes framework@6.1.3 + all fixed plugin patches that have proper semver
 * peerDependencies (no workspace: protocol).
 *
 * Rewrites any remaining workspace:* in peerDependencies or workspace:^ in
 * dependencies to real semver ranges before npm publish, restores after.
 *
 * Usage:
 *   node scripts/publish-peer-dep-fix.mjs           # dry-run (default)
 *   DRY_RUN=0 node scripts/publish-peer-dep-fix.mjs # real publish
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { loadDotenv } from './load-dotenv.mjs';

loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const NPM_TOKEN = process.env.NPM_TOKEN;
if (!NPM_TOKEN) { console.error('NPM_TOKEN not set'); process.exit(1); }

const DRY_RUN = process.env.DRY_RUN !== '0';

// Peer dependency ranges to use for internal packages
const PEER_RANGES = {
  '@holoscript/core': '>=8.0.0',
  '@holoscript/engine': '>=6.1.0',
  '@holoscript/framework': '>=6.1.0',
  '@holoscript/crdt-spatial': '>=1.0.0',
};

function viewVersion(name) {
  try {
    return execSync(`npm view ${JSON.stringify(name)} version`, {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000
    }).trim();
  } catch { return null; }
}

// Build full name→version map by scanning all package dirs (handles non-obvious
// dir names like packages/holoscript → @holoscript/sdk)
const _pkgVersionMap = new Map();
function _scanPackageDir(base) {
  if (!existsSync(base)) return;
  for (const entry of readdirSync(base)) {
    const entryPath = join(base, entry);
    if (!statSync(entryPath).isDirectory()) continue;
    const pkgPath = join(entryPath, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const d = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (d.name && d.version) _pkgVersionMap.set(d.name, d.version);
      } catch { /* skip malformed */ }
    }
  }
}
_scanPackageDir(join(ROOT, 'packages'));
_scanPackageDir(join(ROOT, 'packages', 'plugins'));
_scanPackageDir(join(ROOT, 'packages', 'providers'));
// Deeper scan: packages/* may contain sub-packages (e.g. packages/holoscript/)
for (const entry of readdirSync(join(ROOT, 'packages'))) {
  const entryPath = join(ROOT, 'packages', entry);
  if (statSync(entryPath).isDirectory()) _scanPackageDir(entryPath);
}

function resolveWorkspaceVersion(pkgName) {
  // Direct map lookup first (handles all alias dirs)
  if (_pkgVersionMap.has(pkgName)) return _pkgVersionMap.get(pkgName);
  // Fallback: guess dir from package name
  const name = pkgName.replace('@holoscript/', '');
  for (const sub of ['packages', join('packages', 'plugins'), join('packages', 'providers')]) {
    const p = join(ROOT, sub, name, 'package.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')).version;
  }
  return null;
}

function rewriteWorkspaceRefs(pkg) {
  // peerDependencies: workspace:* → real range
  const peers = pkg.peerDependencies || {};
  for (const [k, v] of Object.entries(peers)) {
    if (String(v).includes('workspace:')) {
      peers[k] = PEER_RANGES[k] || '*';
    }
  }
  // dependencies: workspace:^ → ^current_version
  const deps = pkg.dependencies || {};
  for (const [k, v] of Object.entries(deps)) {
    if (String(v).includes('workspace:')) {
      const ver = resolveWorkspaceVersion(k);
      deps[k] = '^' + (ver || '0.0.0');
    }
  }
  return pkg;
}

async function publishPackage(pkgPath) {
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const name = pkg.name;
  const version = pkg.version;

  const published = viewVersion(name);
  if (published === version) {
    process.stdout.write(`SKIP    ${name}@${version} (already on npm)\n`);
    return 'skip';
  }

  if (DRY_RUN) {
    process.stdout.write(`DRY     ${name}@${version} (would publish; on npm: ${published || 'none'})\n`);
    return 'dry';
  }

  const patched = rewriteWorkspaceRefs(JSON.parse(raw));
  const backup = join(tmpdir(), `prepublish-${name.replace(/[@/]/g, '_')}-${process.pid}.json`);
  const pkgDir = dirname(pkgPath);
  const npmrc = join(pkgDir, '.npmrc');

  copyFileSync(pkgPath, backup);
  try {
    writeFileSync(pkgPath, JSON.stringify(patched, null, 2) + '\n');
    writeFileSync(npmrc, `//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n`);
    execSync('npm publish --access public', {
      cwd: pkgDir, stdio: 'inherit',
      env: { ...process.env, NPM_TOKEN },
    });
    process.stdout.write(`PUBLISHED ${name}@${version}\n`);
    return 'published';
  } catch (e) {
    process.stderr.write(`ERROR   ${name}@${version}: ${e.message}\n`);
    return 'error';
  } finally {
    copyFileSync(backup, pkgPath);
    unlinkSync(backup);
    if (existsSync(npmrc)) unlinkSync(npmrc);
  }
}

// --- Collect packages to publish ---
const packages = [];

// 1. framework (bumped to 6.1.3, deps updated)
packages.push(join(ROOT, 'packages', 'framework', 'package.json'));

// 2. All plugins that have been fixed (no workspace: in peerDeps)
for (const p of readdirSync(join(ROOT, 'packages', 'plugins'))) {
  const pkgPath = join(ROOT, 'packages', 'plugins', p, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.name || !pkg.name.includes('holoscript')) continue;
  // Only include packages where peerDeps have been fixed (no workspace:)
  const peers = pkg.peerDependencies || {};
  const hasLeak = Object.values(peers).some(v => String(v).includes('workspace:'));
  if (!hasLeak) packages.push(pkgPath);
}

console.log(`\nDRY_RUN=${DRY_RUN} | NPM_TOKEN=${NPM_TOKEN ? 'set' : 'MISSING'}`);
console.log(`Packages to evaluate: ${packages.length}\n`);

const results = { published: 0, skip: 0, dry: 0, error: 0 };
for (const pkgPath of packages) {
  const r = await publishPackage(pkgPath);
  results[r] = (results[r] || 0) + 1;
}

console.log('\n=== Results ===');
console.log(JSON.stringify(results, null, 2));
if (results.error > 0) process.exit(1);
