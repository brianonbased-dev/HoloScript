#!/usr/bin/env node
/**
 * Publish one workspace npm package with npm-safe dependency metadata.
 *
 * The monorepo keeps internal dependencies as workspace: ranges, but public npm
 * tarballs must carry semver ranges. This utility temporarily rewrites the
 * selected package.json, runs npm publish or npm publish --dry-run, then restores
 * the working tree manifest.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotenv } from '../load-dotenv.mjs';
import { findPackedTargetFindings } from './package-pack-contract.mjs';

loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const packageIdx = args.indexOf('--package');
const PACKAGE_NAME = packageIdx >= 0 ? args[packageIdx + 1] : null;
const PUBLISH = args.includes('--publish');
const PROVENANCE_ONLY = args.includes('--provenance-only');
const ACCESS = valueAfter('--access') || 'public';
const TAG = valueAfter('--tag') || 'latest';
const REGISTRY = valueAfter('--registry') || process.env.npm_config_registry || null;
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'];
const WORKSPACE_ROOTS = ['packages', 'services', 'benchmarks'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo', '.git']);

if (!PACKAGE_NAME) {
  console.error('[publish-npm-package] missing --package <name>');
  process.exit(2);
}

function valueAfter(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runNpm(cmdArgs, opts = {}) {
  const effectiveArgs = REGISTRY ? [...cmdArgs, '--registry', REGISTRY] : cmdArgs;
  return execFileSync(NPM_BIN, effectiveArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN || '',
      ...opts.env,
    },
    ...opts,
  });
}

function runGit(cmdArgs, opts = {}) {
  return execFileSync('git', cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeout || 60_000,
    ...opts,
  }).trim();
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function assertReleaseProvenance(record) {
  const head = runGit(['rev-parse', 'HEAD']);
  const originMain = runGit(['rev-parse', 'origin/main']);
  if (head !== originMain) {
    throw new Error(
      `release provenance requires HEAD ${head} to equal fetched origin/main ${originMain}`
    );
  }

  const relativePackageDir = record.dir.slice(ROOT.length + 1).replaceAll('\\', '/');
  const packageStatus = runGit(['status', '--porcelain', '--', relativePackageDir]);
  if (packageStatus) {
    throw new Error(
      `release provenance requires a clean package path; dirty entries:\n${packageStatus}`
    );
  }

  if (record.name === '@holoscript/wasm') {
    const webWasm = join(record.dir, 'pkg', 'holoscript_wasm_bg.wasm');
    const nodeWasm = join(record.dir, 'pkg-node', 'holoscript_wasm_bg.wasm');
    const webReceipt = readJson(join(record.dir, 'pkg', 'rebuild-receipt.json'));
    const nodeReceipt = readJson(join(record.dir, 'pkg-node', 'rebuild-receipt.json'));
    const sourceCommit = String(webReceipt.sourceCommit || '');
    if (!/^[0-9a-f]{40}$/u.test(sourceCommit) || nodeReceipt.sourceCommit !== sourceCommit) {
      throw new Error('WASM rebuild receipts must name the same full sourceCommit');
    }
    try {
      runGit(['merge-base', '--is-ancestor', sourceCommit, head]);
    } catch {
      throw new Error(`WASM receipt sourceCommit ${sourceCommit} is not an ancestor of ${head}`);
    }
    const webSha256 = sha256File(webWasm);
    const nodeSha256 = sha256File(nodeWasm);
    if (
      webSha256 !== nodeSha256 ||
      webReceipt.result?.wasmSha256 !== webSha256 ||
      nodeReceipt.result?.wasmSha256 !== nodeSha256 ||
      webReceipt.result?.repeatBuildSha256Matched !== true ||
      nodeReceipt.result?.repeatBuildSha256Matched !== true
    ) {
      throw new Error(
        'WASM browser/Node artifacts must be byte-identical and match deterministic rebuild receipts'
      );
    }
    execFileSync(
      process.execPath,
      [join(ROOT, 'scripts', 'holo-ci', 'check-compiler-wasm-drift.mjs')],
      {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 60_000,
      }
    );
    console.log(
      `[publish-npm-package] provenance PASS ${record.name} source=${sourceCommit.slice(0, 12)} head=${head.slice(0, 12)} wasm=${webSha256.slice(0, 12)}`
    );
    return;
  }

  console.log(`[publish-npm-package] provenance PASS ${record.name} head=${head.slice(0, 12)}`);
}

function discoverPackageJsons(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const manifest = join(full, 'package.json');
      if (existsSync(manifest)) out.push(manifest);
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
      if (!pkg.name || !pkg.version) continue;
      byName.set(pkg.name, {
        dir: dirname(manifest),
        manifest,
        name: pkg.name,
        version: pkg.version,
      });
    }
  }
  return byName;
}

function rewriteWorkspaceSpec(spec, depName, depVersion) {
  const raw = String(spec || '');
  if (!raw.startsWith('workspace:')) return raw;
  const range = raw.slice('workspace:'.length);
  if (range === '*' || range === '^' || range === '') return `^${depVersion}`;
  if (range === '~') return `~${depVersion}`;
  if (/^\d+\.\d+\.\d+/.test(range)) return range;
  throw new Error(`Unsupported workspace spec for ${depName}: ${raw}`);
}

function rewriteWorkspaceRefs(pkg, versionMap) {
  const rewrites = [];
  for (const field of DEP_FIELDS) {
    const deps = pkg[field] || {};
    for (const [depName, spec] of Object.entries(deps)) {
      if (!String(spec).startsWith('workspace:')) continue;
      const depVersion = versionMap.get(depName);
      if (!depVersion) {
        throw new Error(
          `${pkg.name}: ${field}.${depName} uses ${spec}, but no workspace version was found`
        );
      }
      const rewritten = rewriteWorkspaceSpec(spec, depName, depVersion);
      deps[depName] = rewritten;
      rewrites.push({ field, depName, from: spec, to: rewritten });
    }
  }
  return rewrites;
}

function npmViewVersion(name) {
  try {
    return runNpm(['view', name, 'version', '--json'], { timeout: 60_000 })
      .trim()
      .replace(/^"|"$/g, '');
  } catch {
    return null;
  }
}

function packageManagerWarning() {
  try {
    return runNpm(['whoami'], { timeout: 60_000 }).trim();
  } catch (error) {
    if (PUBLISH) {
      throw new Error(
        `npm auth is required for --publish: ${String(error.stderr || error.message || error).slice(0, 600)}`
      );
    }
    return null;
  }
}

function assertPackedTargets(manifest, packageDir) {
  const output = runNpm(['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageDir,
    timeout: 300_000,
  });
  const parsed = JSON.parse(output.trim());
  const pack = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = (pack?.files || []).map((file) => file.path);
  const findings = findPackedTargetFindings(manifest, files);
  if (findings.length > 0) {
    throw new Error(
      `packed target contract failed for ${manifest.name}@${manifest.version}:\n${findings
        .map((finding) => `- ${finding.note}`)
        .join('\n')}`
    );
  }
  console.log(
    `[publish-npm-package] packed-target PASS ${manifest.name}@${manifest.version} files=${files.length}`
  );
}

const packages = workspacePackages();
const record = packages.get(PACKAGE_NAME);
if (!record) {
  console.error(`[publish-npm-package] package not found in workspace: ${PACKAGE_NAME}`);
  process.exit(2);
}

if (PUBLISH || PROVENANCE_ONLY) {
  assertReleaseProvenance(record);
}
if (PROVENANCE_ONLY) {
  process.exit(0);
}

const manifestBackupDir = mkdtempSync(join(tmpdir(), 'holo-npm-publish-'));
const manifestBackup = join(manifestBackupDir, `${basename(record.dir)}-package.json`);
copyFileSync(record.manifest, manifestBackup);

const versionMap = new Map([...packages.values()].map((pkg) => [pkg.name, pkg.version]));
const manifest = readJson(record.manifest);
const publishedVersion = npmViewVersion(manifest.name);
const authUser = packageManagerWarning();
const rewrites = rewriteWorkspaceRefs(manifest, versionMap);
const modeArgs = PUBLISH ? [] : ['--dry-run'];
const publishArgs = ['publish', ...modeArgs, '--access', ACCESS, '--tag', TAG, '--ignore-scripts'];

try {
  writeJson(record.manifest, manifest);
  console.log(
    `[publish-npm-package] ${PUBLISH ? 'PUBLISH' : 'DRY'} ${manifest.name}@${manifest.version} ` +
      `(npm latest: ${publishedVersion || 'missing'}, auth: ${authUser || 'not-checked'})`
  );
  for (const rewrite of rewrites) {
    console.log(
      `[publish-npm-package] rewrite ${rewrite.field}.${rewrite.depName}: ${rewrite.from} -> ${rewrite.to}`
    );
  }
  assertPackedTargets(manifest, record.dir);
  runNpm(publishArgs, {
    cwd: record.dir,
    stdio: 'inherit',
    timeout: 300_000,
  });
  console.log(
    `[publish-npm-package] ${PUBLISH ? 'PUBLISHED' : 'DRY-RUN-PASS'} ${manifest.name}@${manifest.version}`
  );
} finally {
  copyFileSync(manifestBackup, record.manifest);
  rmSync(manifestBackupDir, { recursive: true, force: true });
}
