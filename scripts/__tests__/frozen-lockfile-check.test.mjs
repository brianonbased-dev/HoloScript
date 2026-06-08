#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holo-ci/frozen-lockfile-check.mjs.
 *
 * The gate's job (task_1780443302727_4ftu, P2): catch package.json ⇄ pnpm-lock.yaml drift
 * before it bricks a Railway deploy (it has, twice in 3 days). These tests build synthetic
 * tiny workspaces in a temp dir and assert the static layer's verdict. We always pass
 * --no-pnpm so the test is hermetic and F.103-safe (no install ever runs against a real
 * node_modules) — the static layer alone must catch the deploy-bricking MISSING-dep case.
 *
 * Run via: `node scripts/__tests__/frozen-lockfile-check.test.mjs`.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'frozen-lockfile-check.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}
function assertMatch(text, re, name) {
  testsRun += 1;
  if (re.test(text)) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: ${re} not found in output`);
  }
}

/** Build a temp workspace and run the checker with --no-pnpm (static layer only). */
function runFixture({ rootPkg, lock, packages = {}, workspaceYaml }) {
  const dir = mkdtempSync(join(tmpdir(), 'flock-test-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify(rootPkg, null, 2));
  writeFileSync(join(dir, 'pnpm-lock.yaml'), lock);
  if (workspaceYaml) writeFileSync(join(dir, 'pnpm-workspace.yaml'), workspaceYaml);
  for (const [rel, pkg] of Object.entries(packages)) {
    const pdir = join(dir, rel);
    mkdirSync(pdir, { recursive: true });
    writeFileSync(join(pdir, 'package.json'), JSON.stringify(pkg, null, 2));
  }
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir, '--no-pnpm'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const lockHeader = "lockfileVersion: '6.0'\n\nsettings:\n  autoInstallPeers: true\n\n";

console.log('frozen-lockfile-check.test.mjs');

// 1. IN SYNC — root dep present in lockfile importer → exit 0.
{
  const lock =
    lockHeader +
    'importers:\n\n' +
    '  .:\n    dependencies:\n      left-pad:\n        specifier: ^1.3.0\n        version: 1.3.0\n';
  const r = runFixture({ rootPkg: { name: 'fx', dependencies: { 'left-pad': '^1.3.0' } }, lock });
  assertEq(r.code, 0, 'in-sync root dep → exit 0');
  assertMatch(r.out, /IN SYNC/, 'in-sync prints IN SYNC');
}

// 2. DRIFT — phantom dep in package.json, MISSING from lockfile → exit 1 (the deploy-bricker).
{
  const lock =
    lockHeader +
    'importers:\n\n' +
    '  .:\n    dependencies:\n      left-pad:\n        specifier: ^1.3.0\n        version: 1.3.0\n';
  const r = runFixture({
    rootPkg: {
      name: 'fx',
      dependencies: { 'left-pad': '^1.3.0', '@react-three/postprocessing': '^2.16.0' },
    },
    lock,
  });
  assertEq(r.code, 1, 'phantom dep missing from lock → exit 1');
  assertMatch(r.out, /@react-three\/postprocessing.*MISSING/, 'names the missing phantom dep');
  assertMatch(r.out, /DRIFT/, 'prints DRIFT');
}

// 3. OVERRIDE rewrite — specifier differs because of an overrides target → NOT drift (exit 0).
{
  const lock =
    "lockfileVersion: '6.0'\n\noverrides:\n  three: '>=0.182.0'\n\n" +
    'importers:\n\n' +
    "  .:\n    dependencies:\n      three:\n        specifier: '>=0.182.0'\n        version: 0.182.0\n";
  const r = runFixture({ rootPkg: { name: 'fx', dependencies: { three: '^0.180.0' } }, lock });
  assertEq(r.code, 0, 'override-target specifier rewrite → exit 0 (not drift)');
  assertMatch(r.out, /override\/workspace rewrite/, 'classifies override rewrite as expected');
}

// 4. WORKSPACE alias normalization (workspace:^ → workspace:*) → NOT drift (exit 0).
{
  const lock =
    lockHeader +
    'importers:\n\n' +
    "  packages/app:\n    dependencies:\n      '@scope/lib':\n        specifier: 'workspace:*'\n        version: link:../lib\n";
  const r = runFixture({
    rootPkg: { name: 'fx', private: true },
    lock,
    workspaceYaml: "packages:\n  - 'packages/*'\n",
    packages: {
      'packages/app': { name: '@scope/app', dependencies: { '@scope/lib': 'workspace:^' } },
    },
  });
  assertEq(r.code, 0, 'workspace:^ vs workspace:* → exit 0 (not drift)');
}

// 5. DRIFT in a workspace package (not root) — dep added to packages/app, lock not regenerated.
{
  const lock =
    lockHeader +
    'importers:\n\n' +
    '  packages/app:\n    dependencies:\n      left-pad:\n        specifier: ^1.3.0\n        version: 1.3.0\n';
  const r = runFixture({
    rootPkg: { name: 'fx', private: true },
    lock,
    workspaceYaml: "packages:\n  - 'packages/*'\n",
    packages: {
      'packages/app': {
        name: '@scope/app',
        dependencies: { 'left-pad': '^1.3.0', lodash: '^4.17.21' },
      },
    },
  });
  assertEq(r.code, 1, 'missing dep in a workspace package → exit 1');
  assertMatch(r.out, /packages\/app.*lodash.*MISSING/, 'names the workspace-package drift');
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}
console.log(`\n${testsRun}/${testsRun} tests passed`);
