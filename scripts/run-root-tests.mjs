#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolvePnpm();

const workspacePackages = listWorkspacePackages();
const testPackages = workspacePackages.filter((pkg) => {
  if (path.resolve(pkg.path) === repoRoot || pkg.name === 'holoscript') {
    return false;
  }

  const manifest = readManifest(pkg.path);
  pkg.manifest = manifest;
  return Boolean(manifest.scripts?.test);
});

buildMissingEntries();

console.log(`[root-test] Running ${testPackages.length} workspace test scripts sequentially.`);

for (const pkg of testPackages) {
  const label = pkg.manifest.name ?? pkg.name ?? path.basename(pkg.path);
  console.log(`\n[root-test] ${label}`);
  console.log(`> ${pkg.manifest.scripts.test}\n`);

  const result = spawnSync(pnpm.command, [...pnpm.args, '--dir', pkg.path, 'run', 'test'], {
    cwd: repoRoot,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[root-test] ${label} failed to start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
    console.error(`[root-test] ${label} failed with ${detail}.`);
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}

console.log(`\n[root-test] PASS ${testPackages.length} workspace test scripts.`);

function listWorkspacePackages() {
  const result = spawnSync(
    pnpm.command,
    [...pnpm.args, '-r', '--filter=!holoscript', '--depth', '-1', 'list', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: false,
    }
  );

  if (result.error) {
    console.error(`[root-test] Failed to list workspace packages: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    console.error(`[root-test] pnpm workspace listing failed with exit ${result.status}.`);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function readManifest(packageDir) {
  return JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
}

function resolvePnpm() {
  const npmExecPath = process.env.npm_execpath;
  // Only invoke pnpm via `node <npm_execpath>` if it's a JS file (.js/.mjs/.cjs).
  // Some setups (e.g. GitHub Actions setup-pnpm with @pnpm/exe) expose a native
  // ELF binary at npm_execpath — `node <ELF>` crashes with SyntaxError: Invalid
  // or unexpected token. Spawn the binary directly in that case.
  if (npmExecPath && /pnpm/i.test(path.basename(npmExecPath)) && /\.(c|m)?js$/i.test(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath] };
  }

  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: [] };
}

/**
 * Build the workspace packages whose published entry does not exist yet.
 *
 * WHY TESTS NEED THIS AT ALL. Since 2026-06-08 the CI test gate skipped
 * `pnpm build`, on the stated grounds that "vitest resolves all @holoscript/*
 * imports to TypeScript source via the resolve.alias map in each package's
 * vitest.config.ts". That is true of packages/core. It is not true of the
 * workspace: 138 vitest configs exist, only 37 declare any alias, and those alias
 * some workspace packages and not others. Everything unaliased resolves through
 * package.json exports into a dist/ that is gitignored — and CI wipes gitignored
 * output before every job.
 *
 * WHAT IT COST, measured on @holoscript/absorb-service (the first of 141 packages
 * this runner walks). Before: 39 test files "failed" but only 2 TESTS did — 37
 * files never loaded, behind 22 "Failed to resolve entry for package" errors
 * (@holoscript/config, llm-provider, holoembed, holollama, meaning, uaal). After
 * building its dependency closure: zero resolution failures, 99 files passing,
 * 1432 tests running where 880 had run. 553 tests were not failing — they were
 * never executed, and nothing said so.
 *
 * A TEST FILE THAT CANNOT LOAD IS NOT A FAILING TEST, IT IS AN ABSENT ONE, and
 * the two look identical in a summary line. That is why this belongs in the
 * runner rather than in a CI gate definition: the repository should be able to
 * prepare its own tests, and anyone running them locally gets the same behaviour
 * as CI instead of a quieter version of it.
 *
 * ONLY WHAT IS MISSING. Building everything before every run would add minutes to
 * a local `pnpm test`, and a slow step gets deleted — so this resolves each
 * package's own declared entry and builds only the ones that are not there. On a
 * warm checkout it does nothing and says so.
 */
function buildMissingEntries() {
  const needed = missingEntries();

  if (needed.length === 0) {
    console.log('[root-test] All workspace entries present; nothing to build.');
    return;
  }

  console.log(
    `[root-test] ${needed.length} workspace package(s) have no built entry; building them first ` +
      `so test files can resolve their imports instead of silently not loading.`
  );
  console.log(`[root-test] ${needed.map((pkg) => pkg.name).join(', ')}`);

  const filters = needed.flatMap((pkg) => ['--filter', pkg.name]);
  const result = spawnSync(
    pnpm.command,
    [...pnpm.args, '--workspace-concurrency=1', ...filters, 'run', '--if-present', 'build'],
    { cwd: repoRoot, env: process.env, shell: false, stdio: 'inherit' }
  );

  if (result.error) {
    console.error(`[root-test] Pre-test build failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[root-test] Pre-test build failed with exit ${result.status}. ` +
        `Tests are NOT run, because unresolvable imports report as "0 tests" rather than as an error.`
    );
    process.exit(result.status ?? 1);
  }

  reportUnbuildableEntries();
}

/**
 * Workspace packages whose own declared entry is not on disk.
 */
function missingEntries() {
  const missing = [];
  for (const pkg of workspacePackages) {
    const manifest = pkg.manifest ?? readManifest(pkg.path);
    if (!manifest.scripts?.build || !manifest.name) continue;
    const entry = declaredEntry(manifest);
    if (!entry) continue;
    if (!existsSync(path.join(pkg.path, entry))) {
      missing.push({ name: manifest.name, entry });
    }
  }
  return missing;
}

/**
 * A package that promises an entry its own build never writes.
 *
 * WHY THIS EXISTS. Without it the step above looks like it is working and never
 * converges: it finds the same package missing, builds it, and finds it missing
 * again on the next run, forever, saying nothing about why. Three packages were
 * in exactly that state when this was written — @holoscript/linter named
 * dist/index.js while tsup emitted dist/index.mjs; mcp-server-adversarial's ESM
 * branch pointed at a file tsc never wrote; plugin-hardware-invention inherited
 * noEmit from the root tsconfig, so `tsc` produced nothing and still exited 0.
 * All three are fixed, but the next one should announce itself rather than hide
 * inside a step that quietly repeats.
 *
 * IT WARNS AND DOES NOT FAIL, deliberately. If something imports the package,
 * its test file already fails to load and the run is red anyway. If nothing
 * does, one mislabelled manifest should not hold back 141 other test suites.
 */
function reportUnbuildableEntries() {
  const stillMissing = missingEntries();
  if (stillMissing.length === 0) return;

  console.warn(
    `\n[root-test] WARNING: ${stillMissing.length} package(s) still have no entry after building.`
  );
  console.warn(
    '[root-test] Each names a file in its package.json that its own build never writes:'
  );
  for (const pkg of stillMissing) {
    console.warn(`[root-test]   ${pkg.name} promises ${pkg.entry}`);
  }
  console.warn(
    `[root-test] Anything importing these resolves nothing, so the importing test file does ` +
      `not load at all — which reads as a missing test rather than a failing one. Either fix ` +
      `the manifest to name what the build emits, or fix the build to emit what it names.\n`
  );
}

/**
 * The path a consumer would actually resolve, from the manifest itself.
 *
 * Read from `exports` first (what modern resolution uses) and fall back to
 * `main`. Returning null for a package that declares neither is deliberate: it
 * means there is nothing to check, not that the package is fine.
 */
function declaredEntry(manifest) {
  const fromExports = manifest.exports?.['.'] ?? manifest.exports;
  const candidate =
    (typeof fromExports === 'string' && fromExports) ||
    fromExports?.import?.default ||
    fromExports?.import ||
    fromExports?.require?.default ||
    fromExports?.require ||
    fromExports?.default ||
    manifest.main;
  return typeof candidate === 'string' ? candidate : null;
}
