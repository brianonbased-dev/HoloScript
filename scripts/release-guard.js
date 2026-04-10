#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

const PRIVATE_PACKAGE_IGNORELIST = new Set([
  '@holoscript/collab-server',
  '@holoscript/marketplace-web',
  '@holoscript/studio',
  '@holoscript/ui',
  '@holoscript/video-tutorials',
  'visualizer-client',
]);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
}

function fail(message) {
  console.error(`[release-guard] FAIL: ${message}`);
}

function warn(message) {
  console.warn(`[release-guard] WARN: ${message}`);
}

function getRootVersion() {
  const rootPkgPath = path.join(ROOT, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  return rootPkg.version;
}

function isValidSemver(version) {
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(String(version || '').trim());
}

function checkGitTreeClean() {
  const status = run('git', ['status', '--porcelain']);
  if (status.status !== 0) {
    fail('Unable to verify git status. Ensure git is installed and repository is accessible.');
    if (status.stderr.trim()) {
      console.error(status.stderr.trim());
    }
    return false;
  }

  if (status.stdout.trim().length > 0) {
    fail("Git tree is dirty. Run 'git stash' or commit changes.");
    return false;
  }

  return true;
}

function checkVersionPolicyStrict() {
  const result = run(process.execPath, [path.join('scripts', 'check-version-policy.js'), '--strict']);
  if (result.status !== 0) {
    fail("Version policy violations found. Run 'pnpm version:check:strict' to see details.");
    if (result.stdout.trim()) {
      console.error(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    return false;
  }
  return true;
}

function checkPrivatePackages() {
  if (!fs.existsSync(PACKAGES_DIR)) {
    return true;
  }

  const violations = [];
  const entries = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pkgPath = path.join(PACKAGES_DIR, entry.name, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const pkgName = pkg.name || entry.name;
    if (pkg.private === true && !PRIVATE_PACKAGE_IGNORELIST.has(pkgName)) {
      violations.push(pkgName);
    }
  }

  if (violations.length > 0) {
    fail(
      `Private packages found in publish set that are not ignored: ${violations.sort().join(', ')}. Add them to scripts/release-guard.js ignore list or set private=false intentionally.`
    );
    return false;
  }

  return true;
}

function checkRootSemver() {
  const version = getRootVersion();
  if (!isValidSemver(version)) {
    fail(`Root package.json version is not valid semver: '${version}'.`);
    return false;
  }
  return true;
}

function checkTagWarning() {
  const result = run('git', ['describe', '--tags', '--exact-match']);
  if (result.status !== 0) {
    warn('No exact git tag found for current commit. Continuing (pre-release publish allowed).');
    return;
  }

  const tag = result.stdout.trim();
  if (tag) {
    console.log(`[release-guard] INFO: Current commit is tagged: ${tag}`);
  }
}

function main() {
  const checks = [checkGitTreeClean, checkRootSemver, checkVersionPolicyStrict, checkPrivatePackages];
  let allPassed = true;

  for (const check of checks) {
    const ok = check();
    if (!ok) {
      allPassed = false;
    }
  }

  checkTagWarning();

  if (!allPassed) {
    process.exit(1);
  }

  console.log('[release-guard] PASS: All checks passed. Safe to publish.');
}

main();