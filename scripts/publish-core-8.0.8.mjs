#!/usr/bin/env node
/**
 * publish-core-8.0.8.mjs
 *
 * Publishes @holoscript/core@8.0.8 with ALL workspace: refs properly rewritten:
 *   - dependencies:          workspace:^ → ^{current_version}
 *   - optionalDependencies:  workspace:^ → ^{current_version}
 *   - peerDependencies:      workspace:* → proper semver range
 *
 * Then bumps and publishes @holoscript/cli@8.0.9 (pointing to ^8.0.8 core).
 *
 * Uses --ignore-scripts to skip expensive pnpm build (dist/ already exists).
 *
 * Usage:
 *   DRY_RUN=0 node scripts/publish-core-8.0.8.mjs
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env for NPM_TOKEN
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const NPM_TOKEN = process.env.NPM_TOKEN;
if (!NPM_TOKEN) { console.error('NPM_TOKEN not set'); process.exit(1); }

const DRY_RUN = process.env.DRY_RUN !== '0';

// ---- Peer ranges for internal packages that appear in peerDependencies ----
const PEER_RANGES = {
  '@holoscript/absorb-service': '>=6.1.0',
  '@holoscript/engine':         '>=6.1.0',
  '@holoscript/framework':      '>=6.1.0',
  '@holoscript/mcp-server':     '>=8.0.0',
  '@holoscript/mesh':           '>=6.1.0',
  '@holoscript/core':           '>=8.0.0',
};

// ---- Build full name→version map from all local packages ----
const pkgVersionMap = new Map();

function scanDir(base) {
  if (!existsSync(base)) return;
  for (const entry of readdirSync(base)) {
    const sub = join(base, entry);
    try {
      if (!statSync(sub).isDirectory()) continue;
    } catch { continue; }
    const pkgPath = join(sub, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const d = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (d.name && d.version) pkgVersionMap.set(d.name, d.version);
      } catch { /* skip */ }
    }
  }
}

// Scan all package directories
scanDir(join(ROOT, 'packages'));
scanDir(join(ROOT, 'packages', 'plugins'));
scanDir(join(ROOT, 'packages', 'providers'));
// Scan one level deeper for nested packages (e.g. packages/holoscript/ → @holoscript/sdk)
for (const entry of readdirSync(join(ROOT, 'packages'))) {
  const sub = join(ROOT, 'packages', entry);
  try { if (statSync(sub).isDirectory()) scanDir(sub); } catch { /* skip */ }
}

console.log(`Package map loaded: ${pkgVersionMap.size} packages`);
console.log('Core version in map:', pkgVersionMap.get('@holoscript/core'));

function resolveWorkspaceVersion(pkgName) {
  return pkgVersionMap.get(pkgName) || null;
}

function rewriteAllWorkspaceRefs(pkg) {
  // 1. dependencies: workspace:^ → ^{version}
  for (const [k, v] of Object.entries(pkg.dependencies || {})) {
    if (String(v).includes('workspace:')) {
      const ver = resolveWorkspaceVersion(k);
      if (!ver) {
        console.warn(`  WARN: no local version found for dep ${k}, using ^0.0.0`);
      }
      pkg.dependencies[k] = '^' + (ver || '0.0.0');
    }
  }

  // 2. optionalDependencies: workspace:^ → ^{version}
  for (const [k, v] of Object.entries(pkg.optionalDependencies || {})) {
    if (String(v).includes('workspace:')) {
      const ver = resolveWorkspaceVersion(k);
      if (!ver) {
        console.warn(`  WARN: no local version found for optionalDep ${k}, using ^0.0.0`);
      }
      pkg.optionalDependencies[k] = '^' + (ver || '0.0.0');
    }
  }

  // 3. peerDependencies: workspace:* → semver range
  for (const [k, v] of Object.entries(pkg.peerDependencies || {})) {
    if (String(v).includes('workspace:')) {
      const range = PEER_RANGES[k];
      if (!range) {
        // Try to derive from local version
        const ver = resolveWorkspaceVersion(k);
        pkg.peerDependencies[k] = ver ? `^${ver}` : '*';
        console.warn(`  WARN: no PEER_RANGES entry for ${k}, using ${pkg.peerDependencies[k]}`);
      } else {
        pkg.peerDependencies[k] = range;
      }
    }
  }

  return pkg;
}

function viewVersion(name) {
  try {
    return execSync(`npm view ${JSON.stringify(name)} version`, {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000
    }).trim();
  } catch { return null; }
}

async function publishPackage({ pkgPath, newVersion }) {
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const name = pkg.name;

  if (newVersion) {
    pkg.version = newVersion;
  }
  const version = pkg.version;

  const published = viewVersion(name);
  if (published === version) {
    console.log(`SKIP    ${name}@${version} (already on npm)`);
    return 'skip';
  }

  if (DRY_RUN) {
    const patched = rewriteAllWorkspaceRefs(JSON.parse(JSON.stringify(pkg)));
    // Show what would be rewritten
    const workspaceDeps = [];
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [k, v] of Object.entries(patched[field] || {})) {
        if (String(raw).includes(`"${k}": "workspace:`)) {
          workspaceDeps.push(`  ${field}.${k}: ${JSON.parse(raw)[field]?.[k] || '?'} → ${v}`);
        }
      }
    }
    console.log(`DRY     ${name}@${version} (on npm: ${published || 'none'})`);
    if (workspaceDeps.length) {
      console.log('  Would rewrite:');
      workspaceDeps.slice(0, 10).forEach(l => console.log(l));
      if (workspaceDeps.length > 10) console.log(`  ... and ${workspaceDeps.length - 10} more`);
    }
    return 'dry';
  }

  // Patch and publish
  const patchedPkg = rewriteAllWorkspaceRefs(JSON.parse(JSON.stringify(pkg)));
  const backup = join(tmpdir(), `prepublish-${name.replace(/[@/]/g, '_')}-${process.pid}.json`);
  const pkgDir = dirname(pkgPath);
  const npmrc = join(pkgDir, '.npmrc');

  copyFileSync(pkgPath, backup);
  try {
    // Write new version if bumped
    const fileContent = JSON.parse(raw);
    if (newVersion) fileContent.version = newVersion;
    // Apply workspace rewrites to the file content
    rewriteAllWorkspaceRefs(fileContent);

    writeFileSync(pkgPath, JSON.stringify(fileContent, null, 2) + '\n');
    writeFileSync(npmrc, `//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n`);

    execSync('npm publish --access public --ignore-scripts', {
      cwd: pkgDir,
      stdio: 'inherit',
      env: { ...process.env, NPM_TOKEN },
    });
    console.log(`PUBLISHED ${name}@${version}`);
    return 'published';
  } catch (e) {
    console.error(`ERROR   ${name}@${version}: ${e.message}`);
    return 'error';
  } finally {
    copyFileSync(backup, pkgPath);
    unlinkSync(backup);
    if (existsSync(npmrc)) unlinkSync(npmrc);
  }
}

// ---- Validate core dist/ exists ----
const coreDistIndex = join(ROOT, 'packages', 'core', 'dist', 'index.js');
if (!existsSync(coreDistIndex)) {
  console.error('ERROR: packages/core/dist/index.js does not exist. Build core first.');
  process.exit(1);
}
console.log('core dist/index.js: EXISTS');

// ---- Show what we're about to do ----
const corePkgPath = join(ROOT, 'packages', 'core', 'package.json');
const cliPkgPath  = join(ROOT, 'packages', 'cli',  'package.json');

const corePkg = JSON.parse(readFileSync(corePkgPath, 'utf8'));
const cliPkg  = JSON.parse(readFileSync(cliPkgPath,  'utf8'));

console.log(`\nDRY_RUN=${DRY_RUN} | NPM_TOKEN=${NPM_TOKEN ? 'set' : 'MISSING'}`);
console.log(`\nPlan:`);
console.log(`  1. @holoscript/core  ${corePkg.version} → 8.0.8`);
console.log(`  2. @holoscript/cli   ${cliPkg.version}  → 8.0.9`);
console.log();

// Count workspace: leaks in current core
let leakCount = 0;
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const v of Object.values(corePkg[field] || {})) {
    if (String(v).includes('workspace:')) leakCount++;
  }
}
console.log(`core workspace: refs to rewrite: ${leakCount}`);

const results = { published: 0, skip: 0, dry: 0, error: 0 };

// 1. Publish core@8.0.8
// First update pkgVersionMap to reflect the new 8.0.8 version
pkgVersionMap.set('@holoscript/core', '8.0.8');
let r = await publishPackage({ pkgPath: corePkgPath, newVersion: '8.0.8' });
results[r] = (results[r] || 0) + 1;

if (r === 'error') {
  console.error('\ncore publish failed — aborting cli publish');
  process.exit(1);
}

// 2. Publish cli@8.0.9 (depends on ^8.0.8 core after workspace rewrite)
r = await publishPackage({ pkgPath: cliPkgPath, newVersion: '8.0.9' });
results[r] = (results[r] || 0) + 1;

console.log('\n=== Results ===');
console.log(JSON.stringify(results, null, 2));
if (results.error > 0) process.exit(1);
