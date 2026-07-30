#!/usr/bin/env node
/**
 * Builds the self-pinned std ABI owned-metal job bundle.
 *
 * Every copied byte is first compared with the named Git commit. This prevents
 * an uncommitted worktree artifact from being mislabeled as commit-bound
 * evidence. The resulting directory has no npm dependency and can run under a
 * regular user account on Jetson:
 *
 *   node std-abi-owned-metal-runner.mjs --out receipt.json --host-label jetson-orin
 *
 * Usage:
 *   node scripts/holo-ci/build-std-abi-owned-metal-bundle.mjs
 *     --out <empty-directory> [--source-commit <40-char-sha>]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const args = process.argv.slice(2);

function flagValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`[build-std-abi-owned-metal-bundle] MISCONFIGURED — ${name} requires a value`);
    process.exit(2);
  }
  return value;
}

function fail(message) {
  console.error(`[build-std-abi-owned-metal-bundle] FAIL: ${message}`);
  process.exit(1);
}

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

const outArg = flagValue('--out');
if (!outArg) {
  console.error('[build-std-abi-owned-metal-bundle] MISCONFIGURED — --out is required');
  process.exit(2);
}
const outDir = resolve(outArg);
if (existsSync(outDir) && readdirSync(outDir).length > 0) {
  fail(`output directory must be absent or empty: ${outDir}`);
}
mkdirSync(outDir, { recursive: true });

const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const sourceCommit = flagValue('--source-commit', head);
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  fail(`source commit must be a full 40-character sha, got ${sourceCommit}`);
}
execFileSync('git', ['cat-file', '-e', `${sourceCommit}^{commit}`], {
  cwd: repoRoot,
  stdio: 'pipe',
});

const generatedDir = join(repoRoot, 'packages', 'std', 'conformance', 'generated');
const packagedExecution = JSON.parse(
  readFileSync(join(generatedDir, 'std-abi-packaged-execution.v0.json'), 'utf8')
);
if (packagedExecution.schema !== 'holoscript.std-abi-packaged-execution.v0') {
  fail(`unexpected packaged execution schema ${packagedExecution.schema}`);
}
const ops = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'std', 'conformance', 'std-abi-ops.v0.json'), 'utf8')
);
const stdPackage = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'std', 'package.json'), 'utf8')
);

const files = new Map([
  [
    'std-abi-owned-metal-runner.mjs',
    'scripts/holo-ci/std-abi-owned-metal-runner.mjs',
  ],
  [
    'pkg-node/holoscript_wasm.js',
    'packages/compiler-wasm/pkg-node/holoscript_wasm.js',
  ],
  [
    'pkg-node/holoscript_wasm_bg.wasm',
    'packages/compiler-wasm/pkg-node/holoscript_wasm_bg.wasm',
  ],
  ['pkg-node/package.json', 'packages/compiler-wasm/pkg-node/package.json'],
  [
    'std-abi-conformance.trait.hsplus',
    'packages/std/conformance/generated/std-abi-conformance.trait.hsplus',
  ],
  [
    'std-abi-vectors.v0.jsonl',
    'packages/std/conformance/generated/std-abi-vectors.v0.jsonl',
  ],
  [
    'std-host-binding.mjs',
    'packages/std/conformance/host-abi/std-host-binding.mjs',
  ],
  [
    'std-host-abi.v0.json',
    'packages/std/conformance/host-abi/std-host-abi.v0.json',
  ],
]);

const packagedSources = {};
for (const [trait, relPath] of Object.entries(packagedExecution.sources)) {
  const extension = relPath.endsWith('.hsplus') ? '.hsplus' : '.hs';
  const bundleName = `packaged-${trait}${extension}`;
  if (files.has(bundleName)) fail(`duplicate bundle output name ${bundleName}`);
  files.set(bundleName, relPath);
  packagedSources[trait] = bundleName;
}

const pins = {};
for (const [bundleName, repoRelative] of files) {
  const worktreeBytes = readFileSync(join(repoRoot, ...repoRelative.split('/')));
  let commitBytes;
  try {
    commitBytes = execFileSync('git', ['show', `${sourceCommit}:${repoRelative}`], {
      cwd: repoRoot,
      encoding: null,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    fail(`${repoRelative} is not present in source commit ${sourceCommit}`);
  }
  if (!worktreeBytes.equals(commitBytes)) {
    fail(`${repoRelative} differs from source commit ${sourceCommit}; commit the exact bundle input first`);
  }
  const outputPath = join(outDir, ...bundleName.split('/'));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, worktreeBytes);
  pins[bundleName] = {
    sha256: sha256(worktreeBytes),
    sourcePath: repoRelative,
  };
}

const manifest = {
  schema: 'holoscript.std-abi-owned-metal-bundle.v0',
  sourceCommit,
  stdPackageVersion: stdPackage.version,
  conformanceTrait: ops.conformanceTrait,
  evaluatorExport: 'evaluate_trait_handler_v6',
  packagedSources,
  files: pins,
};
writeFileSync(join(outDir, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `[build-std-abi-owned-metal-bundle] OK: ${Object.keys(pins).length} commit-bound files for HoloScript ${sourceCommit} written to ${outDir}`
);
