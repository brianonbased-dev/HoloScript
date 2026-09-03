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

/**
 * The HIGHEST published version, not the `latest` dist-tag and not the last
 * element of the array.
 *
 * Both of those lie, in different ways. `npm view <pkg> version` returns
 * whatever `latest` points at, and a tag can be moved backwards: on 2026-09-02
 * @holoscript/engine had latest=6.1.7 while 8.0.0 was on the registry. And the
 * `versions` array is PUBLISH ORDER, so `.at(-1)` is the most recently pushed,
 * which is not the greatest once anything is backported.
 *
 * Either mistake makes this gate green-light a version that goes BACKWARDS —
 * it would have approved engine at 6.2.0 while 8.0.0 was already published.
 * Comparing against the max is the only reading that cannot regress a release.
 */
function versionFromNpmJson(parsed) {
  if (typeof parsed === 'string') return parsed;
  if (!Array.isArray(parsed)) return null;
  let max = null;
  for (const candidate of parsed) {
    if (typeof candidate !== 'string') continue;
    if (!parseSemver(candidate)) continue; // ignore prereleases/garbage tags
    if (max === null || compareSemver(candidate, max) === 1) max = candidate;
  }
  return max;
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
      // `versions` (plural), not `version`: the latter is the `latest` dist-tag,
      // which can point below what is actually published. See versionFromNpmJson.
      const stdout = execFileSync(NPM_BIN, ['view', name, 'versions', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      }).trim();
      const parsed = stdout ? JSON.parse(stdout) : null;
      const version = versionFromNpmJson(parsed);
      if (version) {
        const result = { status: 'published', version, versions: Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [version] };
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
            const result = { status: 'published', version, versions: Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [version] };
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
  if (!parseSemver(pkg.version))
    fail(`${pkg.name}: version is not valid x.y.z semver (${pkg.version})`);
  for (const field of ['description', 'license', 'repository']) {
    if (!pkg[field]) fail(`${pkg.name}: missing npm metadata field '${field}'`);
  }
  if (!pkg.main && !pkg.exports && !pkg.bin) {
    fail(`${pkg.name}: no main, exports, or bin entrypoint declared`);
  }
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    fail(`${pkg.name}: missing files[] allowlist for npm package contents`);
  }
  if (
    candidate.allowFirstPublish &&
    pkg.name.startsWith('@') &&
    pkg.publishConfig?.access !== 'public'
  ) {
    fail(`${pkg.name}: first scoped publish requires publishConfig.access='public'`);
  }
}

function checkBuiltEntrypoints(record, publishState) {
  const checksBuilt =
    REQUIRE_BUILT &&
    (SKIP_REGISTRY || publishState === 'publish-update' || publishState === 'first-publish');
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
    // Compare against the highest published version ON THIS PACKAGE'S OWN MAJOR
    // LINE, not the highest overall.
    //
    // A higher major can be ABANDONED, and every such case in this workspace
    // traces to ONE DAY. On 2026-05-03 a 7.0.0 was published across at least six
    // packages — core, cli, framework, engine, absorb-service, platform — and the
    // project then walked away from that major. engine additionally took 8.0.0 on
    // 2026-05-17. platform went on to ship 6.1.0 through 6.1.4 over the following
    // three months; engine's 6.1.x series ran to 6.1.7 on 2026-08-13. For those,
    // the live line is 6.1.x and the next release is 6.1.x+1.
    //
    // core and cli are the exception and must not be lumped in: they genuinely
    // moved to major 8 from June onward (22 and 14 releases, newest 8.7.0 on
    // 2026-08-13), so for them newest-by-date and highest-by-semver agree.
    //
    // The lesson the numbers alone cannot give you: read publish DATES, not
    // version ordering. 8.0.0 looks newer than 6.1.7 and was three months older.
    //
    // Within a major, though, going backwards is always wrong, and that is the
    // regression this gate exists to stop.
    const localMajor = parseSemver(pkg.version)?.[0];
    const sameMajor = (registry.versions || [])
      .filter((v) => parseSemver(v)?.[0] === localMajor)
      .sort((a, b) => compareSemver(a, b) ?? 0);
    const lineMax = sameMajor.length ? sameMajor[sameMajor.length - 1] : null;
    const compareTo = lineMax || registry.version;
    const cmp = compareSemver(pkg.version, compareTo);
    if (cmp === null) {
      fail(`${pkg.name}: cannot compare local ${pkg.version} to registry ${compareTo}`);
    } else if (cmp < 0) {
      fail(`${pkg.name}: local ${pkg.version} is older than npm ${compareTo}`);
    } else if (cmp === 0) {
      publishState = 'already-published';
    } else {
      publishState = 'publish-update';
    }
    // A higher major above the line is reported, never fatal: it may be a real
    // future line, or an abandoned publish the project moved past. The gate
    // cannot tell which, so it says so instead of guessing.
    if (lineMax && compareSemver(registry.version, lineMax) === 1) {
      warn(
        `${pkg.name}: a higher major ${registry.version} exists on npm but the live line is ${lineMax}; ` +
          `releasing ${pkg.version} continues that line and leaves ${registry.version} where it is`
      );
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
  const checksRegistryClosure =
    publishState === 'publish-update' || publishState === 'first-publish';
  for (const field of DEP_FIELDS) {
    const block = pkg[field] || {};
    for (const [depName, spec] of Object.entries(block)) {
      if (!isInternalPackage(depName)) continue;
      const depRecord = packageMap.get(depName);
      if (!depRecord) {
        fail(
          `${pkg.name}: ${field}.${depName} references an internal package not found in workspace`
        );
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
        fail(
          `${pkg.name}: ${field}.${depName}@${depRecord.json.version} is not published and is not in the candidate set`
        );
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
        fail(
          `${pkg.name}: dependency registry lookup failed for ${depName}: ${depRegistry.detail}`
        );
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

  const output = {
    ok: errors.length === 0,
    requireBuilt: REQUIRE_BUILT,
    skipRegistry: SKIP_REGISTRY,
    rows,
    warnings,
    errors,
  };
  if (JSON_OUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const row of rows) {
      const registry =
        row.registry.status === 'published' ? `npm ${row.registry.version}` : row.registry.status;
      console.log(`[npm-v1-release] ${row.name}@${row.version}: ${row.publishState} (${registry})`);
    }
    for (const warning of warnings) console.warn(`[npm-v1-release] WARN: ${warning}`);
    if (errors.length) {
      console.error(`[npm-v1-release] FAIL: ${errors.length} issue(s)`);
      for (const error of errors) console.error(`  - ${error}`);
    } else {
      console.log(
        `[npm-v1-release] PASS: ${rows.length} candidate package(s) are green-lighted by this gate.`
      );
    }
  }

  process.exit(errors.length === 0 ? 0 : 1);
}

main();
