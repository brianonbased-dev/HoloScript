#!/usr/bin/env node
/**
 * Attempts npm publish for each @holoscript plugin under packages/plugins that is
 * not yet on the registry. Replaces workspace:* references to @holoscript/core with
 * the semver from packages/core/package.json.
 *
 * Requirements:
 *   - NPM_TOKEN in .env or env (classic token with publish) or interactive npm login
 *   - Package must look publish-ready: main/types point to dist/, or "files" includes dist/
 *
 * Loads env from HoloScript/.env then ~/.ai-ecosystem/.env (first file found wins for unset keys).
 *
 * Usage:
 *   node scripts/publish-unpublished-plugins.mjs           # dry-run (default)
 *   DRY_RUN=0 node scripts/publish-unpublished-plugins.mjs # real publish
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { loadDotenv } from './load-dotenv.mjs';

const { loadedFrom } = loadDotenv();
if (loadedFrom) {
  console.error(`[publish-unpublished-plugins] Loaded env from ${loadedFrom}`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLUGINS = join(ROOT, 'packages', 'plugins');
const CORE_PKG = join(ROOT, 'packages', 'core', 'package.json');

function viewVersion(name) {
  try {
    return execSync(`npm view ${JSON.stringify(name)} version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20000,
    }).trim();
  } catch {
    return null;
  }
}

function coreVersion() {
  const j = JSON.parse(readFileSync(CORE_PKG, 'utf-8'));
  return j.version || '6.0.0';
}

function replaceWorkspace(obj, semver) {
  if (obj === 'workspace:*') return `^${semver}`;
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((x) => replaceWorkspace(x, semver));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = replaceWorkspace(v, semver);
  }
  return out;
}

function looksPublishReady(pkg) {
  const main = pkg.main || '';
  const types = pkg.types || '';
  if (typeof main === 'string' && main.includes('dist/')) return true;
  if (typeof types === 'string' && types.includes('dist/')) return true;
  const files = pkg.files;
  if (Array.isArray(files) && files.some((f) => String(f).startsWith('dist'))) return true;
  return false;
}

const dryRun = process.env.DRY_RUN !== '0';
const semver = coreVersion();

const dirs = readdirSync(PLUGINS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const results = [];
for (const dir of dirs.sort()) {
  const pkgPath = join(PLUGINS, dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const raw = readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw);
  const name = pkg.name;
  if (!name || !name.includes('holoscript')) continue;

  if (viewVersion(name)) {
    results.push({ dir, name, skipped: 'already on npm' });
    continue;
  }
  if (!looksPublishReady(pkg)) {
    results.push({ dir, name, skipped: 'not publish-ready (no dist entrypoint)' });
    continue;
  }

  const patched = replaceWorkspace(JSON.parse(raw), semver);
  /** Keep backup outside the package dir so npm pack never ships it. */
  const backup = join(tmpdir(), `holoscript-prepublish-${dir}-${process.pid}.json`);
  if (dryRun) {
    results.push({ dir, name, skipped: 'dry-run: would patch workspace + npm publish' });
    continue;
  }

  const token = process.env.NPM_TOKEN;
  if (!token) {
    results.push({ dir, name, skipped: 'NPM_TOKEN unset' });
    continue;
  }

  copyFileSync(pkgPath, backup);
  try {
    writeFileSync(pkgPath, JSON.stringify(patched, null, 2) + '\n');
    const npmrc = join(PLUGINS, dir, '.npmrc');
    const npmrcLine = `//registry.npmjs.org/:_authToken=${token}\n`;
    writeFileSync(npmrc, npmrcLine);
    execSync('npm publish --access public', {
      cwd: join(PLUGINS, dir),
      stdio: 'inherit',
      env: { ...process.env, NPM_TOKEN: token },
    });
    results.push({ dir, name, skipped: false, published: true });
  } catch (e) {
    results.push({ dir, name, skipped: false, error: String(e) });
  } finally {
    if (existsSync(backup)) {
      copyFileSync(backup, pkgPath);
      unlinkSync(backup);
    }
    const npmrc = join(PLUGINS, dir, '.npmrc');
    if (existsSync(npmrc)) unlinkSync(npmrc);
  }
}

console.log(JSON.stringify({ dryRun, coreSemver: semver, results }, null, 2));
