#!/usr/bin/env node
/**
 * check-npm-v1-release-readiness.mjs
 *
 * This is the npm publish green-light gate for the explicit v1 candidate set.
 * It does not publish. It proves the candidate manifests are public-ready, the
 * built entrypoints exist when requested, and registry versions/dependency
 * closure will not strand cold installers on unpublished @holoscript pins.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SKIP_REGISTRY = args.includes('--skip-registry');
const REQUIRE_BUILT = args.includes('--require-built');
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'npm-v1-release-manifest.json');
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const WORKSPACE_ROOTS = ['packages', 'services', 'benchmarks'];
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo', '.git']);

const errors = [];
const warnings = [];
const rows = [];
const registryCache = new Map();

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isInternalPackage(name) {
  return name.startsWith('@holoscript/') || name.startsWith('holoscript-');
}

function parseSemver(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function versionFromNpmJson(parsed) {
  if (typeof parsed === 'string') return parsed;
  if (Array.isArray(parsed) && typeof parsed.at(-1) === 'string') return parsed.at(-1);
  return null;
}

function discoverPackageJsons(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const manifest = join(full, 'package.json');
      if (existsSync(manifest)) {
        out.push(manifest);
      }
      discoverPackageJsons(full, out);
    }
  }
  return out;
}

function workspacePackages() {
  const byName = new Map();
  for (const root of WORKSPACE_ROOTS) {
    for (const manifest of discoverPackageJsons(join(ROOT, root))) {
      const pkg = readJson(manifest);
      if (!pkg.name) continue;
      byName.set(pkg.name, {
        dir: dirname(manifest),
        manifest,
        json: pkg,
      });
    }
  }
  return byName;
}

function npmViewVersion(name) {
  if (SKIP_REGISTRY) return { status: 'skipped' };
  if (registryCache.has(name)) return registryCache.get(name);
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const stdout = execFileSync(NPM_BIN, ['view', name, 'version', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      }).trim();
      const parsed = stdout ? JSON.parse(stdout) : null;
      const version = versionFromNpmJson(parsed);
      if (version) {
        const result = { status: 'published', version };
        registryCache.set(name, result);
        return result;
      }
      if (parsed?.error?.code === 'E404') {
        const result = { status: 'missing' };
        registryCache.set(name, result);
        return result;
      }
      throw new Error(`npm returned version JSON in an unexpected shape for ${name}`);
    } catch (error) {
      lastError = error;
      const stdout = String(error.stdout || '').trim();
      if (stdout) {
        try {
          const parsed = JSON.parse(stdout);
          const version = versionFromNpmJson(parsed);
          if (version) {
            const result = { status: 'published', version };
            registryCache.set(name, result);
            return result;
          }
          if (parsed?.error?.code === 'E404') {
            const result = { status: 'missing' };
            registryCache.set(name, result);
            return result;
          }
        } catch {
          /* fall through to retry/error classification */
        }
      }
      const detail = `${error.stderr || ''}${error.stdout || ''}${error.message || ''}`;
      if (/E404|not found/i.test(detail)) {
        const result = { status: 'missing' };
        registryCache.set(name, result);
        return result;
      }
    }
  }
  const detail = `${lastError?.stderr || ''}${lastError?.stdout || ''}${lastError?.message || ''}`;
  const result = { status: 'error', detail: detail.slice(0, 1200) };
  registryCache.set(name, result);
  return result;
}

function collectEntrypoints(value, out = new Set()) {
  if (!value) return out;
  if (typeof value === 'string') {
    if (value.startsWith('./')) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEntrypoints(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectEntrypoints(item, out);
  }
  return out;
}

function packageEntrypoints(pkg) {
  const out = new Set();
  collectEntrypoints(pkg.main, out);
  collectEntrypoints(pkg.module, out);
  collectEntrypoints(pkg.types, out);
  collectEntrypoints(pkg.exports, out);
  for (const binPath of Object.values(pkg.bin || {})) collectEntrypoints(binPath, out);
  return [...out].filter((entry) => !entry.includes('*'));
}

function checkManifestBasics(candidate, record) {
  const pkg = record.json;
  if (pkg.private === true) fail(`${pkg.name}: candidate package is private`);
  if (!parseSemver(pkg.version)) fail(`${pkg.name}: version is not valid x.y.z semver (${pkg.version})`);
  for (const field of ['description', 'license', 'repository']) {
    if (!pkg[field]) fail(`${pkg.name}: missing npm metadata field '${field}'`);
  }
  if (!pkg.main && !pkg.exports && !pkg.bin) {
    fail(`${pkg.name}: no main, exports, or bin entrypoint declared`);
  }
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    fail(`${pkg.name}: missing files[] allowlist for npm package contents`);
  }
  if (candidate.allowFirstPublish && pkg.name.startsWith('@') && pkg.publishConfig?.access !== 'public') {
    fail(`${pkg.name}: first scoped publish requires publishConfig.access='public'`);
  }
}

function checkBuiltEntrypoints(record, publishState) {
  const checksBuilt = REQUIRE_BUILT && (SKIP_REGISTRY || publishState === 'publish-update' || publishState === 'first-publish');
  if (!checksBuilt) return;
  for (const entry of packageEntrypoints(record.json)) {
    const full = join(record.dir, entry);
    if (!existsSync(full)) {
      fail(`${record.json.name}: built entrypoint missing: ${entry}`);
    }
  }
}

function checkRegistry(candidate, record) {
  const pkg = record.json;
  const registry = npmViewVersion(pkg.name);
  let publishState = 'registry-skipped';
  if (registry.status === 'published') {
    const cmp = compareSemver(pkg.version, registry.version);
    if (cmp === null) {
      fail(`${pkg.name}: cannot compare local ${pkg.version} to registry ${registry.version}`);
    } else if (cmp < 0) {
      fail(`${pkg.name}: local ${pkg.version} is older than npm ${registry.version}`);
    } else if (cmp === 0) {
      publishState = 'already-published';
    } else {
      publishState = 'publish-update';
    }
  } else if (registry.status === 'missing') {
    if (!candidate.allowFirstPublish) {
      fail(`${pkg.name}: package is missing from npm and allowFirstPublish is not set`);
    }
    publishState = 'first-publish';
  } else if (registry.status === 'error') {
    fail(`${pkg.name}: npm registry lookup failed: ${registry.detail}`);
  }
  rows.push({ name: pkg.name, version: pkg.version, registry, publishState });
  return publishState;
}

function checkDependencyClosure(candidateSet, packageMap, record, publishState) {
  const pkg = record.json;
  const checksRegistryClosure = publishState === 'publish-update' || publishState === 'first-publish';
  for (const field of DEP_FIELDS) {
    const block = pkg[field] || {};
    for (const [depName, spec] of Object.entries(block)) {
      if (!isInternalPackage(depName)) continue;
      const depRecord = packageMap.get(depName);
      if (!depRecord) {
        fail(`${pkg.name}: ${field}.${depName} references an internal package not found in workspace`);
        continue;
      }
      if (depRecord.json.private === true && field !== 'peerDependencies') {
        fail(`${pkg.name}: ${field}.${depName} points at private workspace package ${depName}`);
      }
      if (!String(spec).startsWith('workspace:') && field !== 'peerDependencies') {
        warn(`${pkg.name}: ${field}.${depName} uses non-workspace spec '${spec}'`);
      }
      if (!checksRegistryClosure || SKIP_REGISTRY || depRecord.json.private === true) continue;
      const depRegistry = npmViewVersion(depName);
      if (depRegistry.status === 'missing' && !candidateSet.has(depName)) {
        fail(`${pkg.name}: ${field}.${depName}@${depRecord.json.version} is not published and is not in the candidate set`);
      }
      if (depRegistry.status === 'published') {
        const cmp = compareSemver(depRecord.json.version, depRegistry.version);
        if (cmp !== null && cmp > 0 && !candidateSet.has(depName)) {
          fail(
            `${pkg.name}: ${field}.${depName} needs ${depRecord.json.version}, but npm latest is ${depRegistry.version} and ${depName} is not in the candidate set`
          );
        }
      }
      if (depRegistry.status === 'error') {
        fail(`${pkg.name}: dependency registry lookup failed for ${depName}: ${depRegistry.detail}`);
      }
    }
  }
}

function main() {
  if (!existsSync(MANIFEST)) fail(`release manifest missing: ${MANIFEST}`);
  const manifest = errors.length ? { candidatePackages: [] } : readJson(MANIFEST);
  const candidates = manifest.candidatePackages || [];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    fail('release manifest has no candidatePackages[]');
  }

  const packageMap = workspacePackages();
  const candidateSet = new Set(candidates.map((candidate) => candidate.name || candidate));

  for (const raw of candidates) {
    const candidate = typeof raw === 'string' ? { name: raw } : raw;
    const record = packageMap.get(candidate.name);
    if (!record) {
      fail(`${candidate.name}: candidate package not found in workspace`);
      continue;
    }
    checkManifestBasics(candidate, record);
    const publishState = checkRegistry(candidate, record);
    checkBuiltEntrypoints(record, publishState);
    checkDependencyClosure(candidateSet, packageMap, record, publishState);
  }

  const output = { ok: errors.length === 0, requireBuilt: REQUIRE_BUILT, skipRegistry: SKIP_REGISTRY, rows, warnings, errors };
  if (JSON_OUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const row of rows) {
      const registry =
        row.registry.status === 'published'
          ? `npm ${row.registry.version}`
          : row.registry.status;
      console.log(`[npm-v1-release] ${row.name}@${row.version}: ${row.publishState} (${registry})`);
    }
    for (const warning of warnings) console.warn(`[npm-v1-release] WARN: ${warning}`);
    if (errors.length) {
      console.error(`[npm-v1-release] FAIL: ${errors.length} issue(s)`);
      for (const error of errors) console.error(`  - ${error}`);
    } else {
      console.log(`[npm-v1-release] PASS: ${rows.length} candidate package(s) are green-lighted by this gate.`);
    }
  }

  process.exit(errors.length === 0 ? 0 : 1);
}

main();
