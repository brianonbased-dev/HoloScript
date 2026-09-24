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
import { assertNoWorkspaceSpecs, rewriteWorkspaceRefs } from './rewrite-workspace-deps.mjs';
import {
  assertAllowedTarballPackage,
  assertFramework617Repair,
  assertRequiredDeps,
  assertSameFilesExcept,
  assertSnn873Repair,
  parseRequireDep,
  pickPublishableVersion,
} from './publish-tarball-contract.mjs';

loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ROOT = resolve(valueAfter('--root') || resolve(__dirname, '..', '..'));
const packageIdx = args.indexOf('--package');
const PACKAGE_NAME = packageIdx >= 0 ? args[packageIdx + 1] : null;
const TARBALL = valueAfter('--tarball');
const SAME_FILES_AS = valueAfter('--same-files-as');
const REQUIRE_DEPS = valuesAfterAll('--require-dep').map(parseRequireDep);
const PUBLISH = args.includes('--publish');
const INSPECT_ONLY = args.includes('--inspect-only');
const PROVENANCE_ONLY = args.includes('--provenance-only');
// The canonical remote is `canon` (.holorepo/git/main.git) — the repo
// `holorepo change land` writes to. NOT `origin`: in this ecosystem origin is
// GitHub, which INTENT.md calls federation/export only, "a free distribution
// surface, never a supplier". Overridable so the fault-injection tests can
// point at a sandbox remote, and so a differently-wired checkout can say so.
const PROVENANCE_REMOTE =
  valueAfter('--provenance-remote') || process.env.HOLO_RELEASE_REMOTE || 'canon';
const PROVENANCE_BRANCH =
  valueAfter('--provenance-branch') || process.env.HOLO_RELEASE_BRANCH || 'main';
const ACCESS = valueAfter('--access') || 'public';
const TAG = valueAfter('--tag') || 'latest';
const REGISTRY = valueAfter('--registry') || process.env.npm_config_registry || null;
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
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

function valuesAfterAll(flag) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function withAuthNpmRc(callback) {
  const token = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;
  if (!token) return callback([]);
  const dir = mkdtempSync(join(tmpdir(), 'holo-npm-auth-'));
  const npmrc = join(dir, '.npmrc');
  writeFileSync(npmrc, `//registry.npmjs.org/:_authToken=${token}\n`);
  try {
    return callback(['--userconfig', npmrc]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runNpm(cmdArgs, opts = {}) {
  return withAuthNpmRc((authArgs) => {
    const effectiveArgs = [
      ...cmdArgs,
      ...authArgs,
      ...(REGISTRY ? ['--registry', REGISTRY] : []),
    ];
    return execFileSync(NPM_BIN, effectiveArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      timeout: opts.timeout,
      env: {
        ...process.env,
        NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN || '',
        ...opts.env,
      },
    });
  });
}

function runPnpm(cmdArgs, opts = {}) {
  return execFileSync(PNPM_BIN, cmdArgs, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: opts.timeout || 180_000,
    env: {
      ...process.env,
      ...opts.env,
    },
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

/**
 * Resolve the tip of the canonical remote's release branch, fetching it first.
 *
 * This replaces two defects, both found on 2026-09-03 after three packages
 * shipped broken to npm:
 *
 * 1. It compared against `origin/main`. Here `origin` is GitHub, which is
 *    federation/export only — never the supplier. The supplier is `canon`.
 *    Proving a release against the mirror proved the wrong repository.
 *
 * 2. It never fetched. `rev-parse origin/main` reads the local
 *    remote-tracking ref, which is exactly as old as the last fetch — while
 *    the failure message said "fetched origin/main". A tracking ref left
 *    equal to HEAD by an old fetch would have passed a release that is not on
 *    the remote at all. The message asserted a property the code never
 *    checked, which is the failure mode this whole gate exists to prevent.
 *
 * Scope, stated plainly so the next reader does not overclaim it: this proves
 * the published tree IS the tip of canon's release branch, so anyone holding
 * canon can fetch that sha and rebuild the tarball. It does not prove the land
 * pipeline approved it — canon is a bare repo with no receive hooks, so a
 * direct push would also satisfy this. Reproducibility, not authorization.
 */
function fetchCanonicalTip() {
  const remotes = runGit(['remote'])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!remotes.includes(PROVENANCE_REMOTE)) {
    throw new Error(
      `release provenance requires the canonical remote "${PROVENANCE_REMOTE}", ` +
        `which this checkout does not have (remotes: ${remotes.join(', ') || 'none'}). ` +
        `Add it, or name the right one with --provenance-remote.`
    );
  }
  try {
    runGit(['fetch', '--quiet', PROVENANCE_REMOTE, PROVENANCE_BRANCH], { timeout: 120_000 });
  } catch (error) {
    throw new Error(
      `release provenance could not fetch ${PROVENANCE_REMOTE}/${PROVENANCE_BRANCH}: ` +
        String(error.stderr || error.message || error)
          .trim()
          .slice(0, 400)
    );
  }
  return runGit(['rev-parse', 'FETCH_HEAD']);
}

function assertReleaseProvenance(record) {
  const head = runGit(['rev-parse', 'HEAD']);
  const canonicalRef = `${PROVENANCE_REMOTE}/${PROVENANCE_BRANCH}`;
  const canonicalTip = fetchCanonicalTip();
  if (head !== canonicalTip) {
    let relation = '';
    try {
      const [behind, ahead] = runGit([
        'rev-list',
        '--left-right',
        '--count',
        `${canonicalTip}...${head}`,
      ]).split(/\s+/);
      relation = ` — HEAD is ${ahead} ahead and ${behind} behind`;
    } catch {
      // The ahead/behind read is a courtesy for the operator. If the two shas
      // share no history it cannot be computed; never let that mask the
      // mismatch itself.
    }
    throw new Error(
      `release provenance requires HEAD ${head} to equal fetched ${canonicalRef} ` +
        `${canonicalTip}${relation}. Land the work into ${PROVENANCE_REMOTE} before publishing.`
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
      `[publish-npm-package] provenance PASS ${record.name} source=${sourceCommit.slice(0, 12)} head=${head.slice(0, 12)} ${canonicalRef} wasm=${webSha256.slice(0, 12)}`
    );
    return;
  }

  console.log(
    `[publish-npm-package] provenance PASS ${record.name} head=${head.slice(0, 12)} ${canonicalRef}`
  );
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

function npmViewVersion(name) {
  try {
    return runNpm(['view', name, 'version', '--json'], { timeout: 60_000 })
      .trim()
      .replace(/^"|"$/g, '');
  } catch {
    return null;
  }
}

function npmViewExactVersion(name, version) {
  if (!name || !version) return null;
  try {
    return runNpm(['view', `${name}@${version}`, 'version', '--json'], { timeout: 60_000 })
      .trim()
      .replace(/^"|"$/g, '');
  } catch {
    return null;
  }
}

function npmViewVersions(name) {
  try {
    const parsed = JSON.parse(runNpm(['view', name, 'versions', '--json'], { timeout: 60_000 }).trim());
    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

/**
 * Prefer the workspace version when it is already on the registry. If this
 * checkout is ahead of npm (core 8.8.0 locally, 8.7.0 published), pin the
 * highest published version in the same major. Do not use the latest dist-tag:
 * that tag can sit below a later published line.
 */
function resolvePublishableVersion(depName, localVersion) {
  const picked = pickPublishableVersion(localVersion, {
    exactExists: Boolean(npmViewExactVersion(depName, localVersion)),
    versions: npmViewVersions(depName),
  });
  if (!picked) {
    throw new Error(
      `cannot rewrite ${depName} to ^${localVersion}: ${depName} is not on the registry`
    );
  }
  if (picked !== localVersion) {
    console.log(
      `[publish-npm-package] cap ${depName} local ${localVersion} (unpublished) -> published ${picked}`
    );
  }
  return picked;
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

function npmWhoamiOk() {
  try {
    runNpm(['whoami'], { timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

function clearNpmAuthEnv() {
  delete process.env.NPM_TOKEN;
  delete process.env.NODE_AUTH_TOKEN;
  delete process.env.npm_token;
}

/**
 * Prefer NODE_AUTH_TOKEN / NPM_TOKEN already in process.env (from loadDotenv)
 * when `npm whoami` accepts them. A 401 env token must not shadow HoloKey.
 * Never print the value.
 */
async function resolveNpmAuthSource() {
  if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
    if (npmWhoamiOk()) return 'env';
    console.log('[publish-npm-package] env npm token rejected by whoami; trying HoloKey');
    clearNpmAuthEnv();
  }
  try {
    const pkg = await import('@holoscript/secrets-broker');
    if (!pkg?.createHoloKeyVault) return 'holokey-unbuilt';
    const dbUrl = process.env.HOLOKEY_DATABASE_URL || process.env.DATABASE_URL;
    let query;
    let pool = null;
    if (dbUrl) {
      const pg = (await import('pg')).default;
      pool = new pg.Pool({ connectionString: dbUrl });
      query = (sql, params) => pool.query(sql, params);
    }
    try {
      const vault = pkg.createHoloKeyVault({ env: process.env, query });
      if (!vault) return 'holokey-off';
      const owner = process.env.HOLOKEY_OWNER || 'infra';
      for (const name of ['NPM_TOKEN', 'NODE_AUTH_TOKEN']) {
        try {
          const resolved = await vault.resolver.resolve({
            authenticatedOwnerId: owner,
            ref: `vault:${name}`,
          });
          if (resolved?.value) {
            process.env.NODE_AUTH_TOKEN = resolved.value;
            process.env.NPM_TOKEN = process.env.NPM_TOKEN || resolved.value;
            return 'holokey';
          }
        } catch {
          // try the next well-known name; absence is not a crash
        }
      }
      return 'holokey-missing-npm-token';
    } finally {
      if (pool) await pool.end();
    }
  } catch {
    return 'holokey-error';
  }
}

function packWithPnpm(packageDir) {
  const dest = mkdtempSync(join(tmpdir(), 'holo-npm-pack-'));
  const output = runPnpm(['pack', '--json', '--pack-destination', dest], {
    cwd: packageDir,
    timeout: 180_000,
  });
  const parsed = JSON.parse(output.trim());
  const pack = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = (pack?.files || []).map((file) => file.path);
  const filename = pack?.filename;
  if (!filename || !existsSync(filename)) {
    throw new Error(`pnpm pack did not write a tarball under ${dest}`);
  }
  return { dest, filename, files };
}

/**
 * Windows tar arguments.
 *
 * Git-Bash/MSYS tar reads a leading drive letter as an rsh-style remote host, so reading a
 * tarball by absolute Windows path fails with "Cannot connect to C: resolve failed". A publish
 * from a Windows checkout then dies after packing. --force-local tells tar the colon is part
 * of the filename. win32 only: GNU tar elsewhere does not need it, and BSD tar does not accept it.
 */
const TAR_LOCAL = process.platform === 'win32' ? ['--force-local'] : [];

function readPackedPackageJson(tarball) {
  return JSON.parse(
    execFileSync('tar', [...TAR_LOCAL, '-xOf', tarball, 'package/package.json'], {
      encoding: 'utf8',
      timeout: 30_000,
    })
  );
}

function assertPackedTargets(manifest, files) {
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

function inspectPackedTarball(tarball) {
  if (!existsSync(tarball)) {
    throw new Error(`tarball not found: ${tarball}`);
  }
  const packedManifest = readPackedPackageJson(tarball);
  if (PACKAGE_NAME && packedManifest.name !== PACKAGE_NAME) {
    throw new Error(
      `tarball name ${packedManifest.name} does not match --package ${PACKAGE_NAME}`
    );
  }
  assertAllowedTarballPackage(packedManifest.name);
  assertNoWorkspaceSpecs(packedManifest, {
    label: `${packedManifest.name}@${packedManifest.version} packed tarball`,
  });
  if (
    packedManifest.name === '@holoscript/framework' &&
    packedManifest.version === '6.1.7'
  ) {
    if (!SAME_FILES_AS) {
      throw new Error(
        '@holoscript/framework@6.1.7 requires --same-files-as the published 6.1.6 tarball'
      );
    }
    const sourceTarball = resolve(SAME_FILES_AS);
    const sourceManifest = readPackedPackageJson(sourceTarball);
    assertFramework617Repair({
      tarballPath: tarball,
      sourceTarballPath: sourceTarball,
      packedManifest,
      sourceManifest,
    });
    assertSameFilesExcept(tarball, sourceTarball);
    console.log(
      `[publish-npm-package] framework-6.1.7-repair PASS vs ${sourceTarball}`
    );
  } else if (
    packedManifest.name === '@holoscript/snn-webgpu' &&
    packedManifest.version === '8.7.3'
  ) {
    if (!SAME_FILES_AS) {
      throw new Error(
        '@holoscript/snn-webgpu@8.7.3 requires --same-files-as the published 8.7.2 tarball'
      );
    }
    const sourceTarball = resolve(SAME_FILES_AS);
    const sourceManifest = readPackedPackageJson(sourceTarball);
    assertSnn873Repair({
      tarballPath: tarball,
      sourceTarballPath: sourceTarball,
      packedManifest,
      sourceManifest,
    });
    assertSameFilesExcept(tarball, sourceTarball);
    console.log(
      `[publish-npm-package] snn-webgpu-8.7.3-repair PASS vs ${sourceTarball}`
    );
  } else {
    if (REQUIRE_DEPS.length > 0) {
      assertRequiredDeps(packedManifest, REQUIRE_DEPS);
      console.log(
        `[publish-npm-package] required-deps PASS ${packedManifest.name}@${packedManifest.version}`
      );
    }
    if (SAME_FILES_AS) {
      const sourceTarball = resolve(SAME_FILES_AS);
      if (!existsSync(sourceTarball)) {
        throw new Error(`--same-files-as tarball not found: ${sourceTarball}`);
      }
      assertSameFilesExcept(tarball, sourceTarball);
      console.log(
        `[publish-npm-package] same-files PASS ${packedManifest.name}@${packedManifest.version} vs ${sourceTarball}`
      );
    }
  }
  console.log(
    `[publish-npm-package] packed-manifest PASS ${packedManifest.name}@${packedManifest.version} no workspace: specs`
  );
  return packedManifest;
}

function publishInspectedTarball(tarball, packedManifest, { access, tag, publish }) {
  const modeArgs = publish ? [] : ['--dry-run'];
  runNpm(['publish', tarball, ...modeArgs, '--access', access, '--tag', tag, '--ignore-scripts'], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 600_000,
  });
  console.log(
    `[publish-npm-package] ${publish ? 'PUBLISHED' : 'DRY-RUN-PASS'} ${packedManifest.name}@${packedManifest.version} from tarball`
  );
  return packedManifest;
}

async function main() {
  if (TARBALL) {
    const packedTarball = resolve(TARBALL);
    const packedManifest = inspectPackedTarball(packedTarball);
    if (INSPECT_ONLY) {
      console.log(
        `[publish-npm-package] INSPECT-ONLY-PASS ${packedManifest.name}@${packedManifest.version}`
      );
      return;
    }
    if (PROVENANCE_ONLY) {
      console.error('[publish-npm-package] --provenance-only is incompatible with --tarball');
      process.exit(2);
    }
    const authSource = await resolveNpmAuthSource();
    console.log(`[publish-npm-package] auth-source ${authSource}`);
    const authUser = packageManagerWarning();
    console.log(`[publish-npm-package] tarball-auth ${authUser || 'not-checked'}`);
    publishInspectedTarball(packedTarball, packedManifest, {
      access: ACCESS,
      tag: TAG,
      publish: PUBLISH,
    });
    return;
  }

  const authSource = await resolveNpmAuthSource();
  console.log(`[publish-npm-package] auth-source ${authSource}`);

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
  if (
    (manifest.name === '@holoscript/framework' && manifest.version === '6.1.7') ||
    (manifest.name === '@holoscript/snn-webgpu' && manifest.version === '8.7.3')
  ) {
    throw new Error(
      `${manifest.name}@${manifest.version} must be published via --tarball of the published prior repair`
    );
  }
  const publishedVersion = npmViewVersion(manifest.name);
  const authUser = packageManagerWarning();
  const rewrites = rewriteWorkspaceRefs(manifest, versionMap, {
    resolveVersion: resolvePublishableVersion,
  });
  const modeArgs = PUBLISH ? [] : ['--dry-run'];

  let packed = null;
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
    packed = packWithPnpm(record.dir);
    assertPackedTargets(manifest, packed.files);
    assertNoWorkspaceSpecs(readPackedPackageJson(packed.filename), {
      label: `${manifest.name}@${manifest.version} packed tarball`,
    });
    console.log(
      `[publish-npm-package] packed-manifest PASS ${manifest.name}@${manifest.version} no workspace: specs`
    );
    runNpm(['publish', packed.filename, ...modeArgs, '--access', ACCESS, '--tag', TAG, '--ignore-scripts'], {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 300_000,
    });
    console.log(
      `[publish-npm-package] ${PUBLISH ? 'PUBLISHED' : 'DRY-RUN-PASS'} ${manifest.name}@${manifest.version}`
    );
  } finally {
    copyFileSync(manifestBackup, record.manifest);
    rmSync(manifestBackupDir, { recursive: true, force: true });
    if (packed?.dest) rmSync(packed.dest, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[publish-npm-package] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
