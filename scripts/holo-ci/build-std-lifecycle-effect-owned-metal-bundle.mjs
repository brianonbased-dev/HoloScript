#!/usr/bin/env node
/** Build a self-pinned, commit-bound bundle for a regular-user owned-metal run. */

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

function argValue(flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`[build-std-lifecycle-owned-metal] ${flag} requires a value`);
    process.exit(2);
  }
  return value;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fail(message) {
  console.error(`[build-std-lifecycle-owned-metal] FAIL: ${message}`);
  process.exit(1);
}

const outArg = argValue('--out');
if (!outArg) fail('--out is required');
const outDir = resolve(outArg);
if (existsSync(outDir) && readdirSync(outDir).length > 0) {
  fail(`output directory must be absent or empty: ${outDir}`);
}
mkdirSync(outDir, { recursive: true });
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const sourceCommit = argValue('--source-commit', head);
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  fail(`source commit must be a full sha, got ${sourceCommit}`);
}
execFileSync('git', ['cat-file', '-e', `${sourceCommit}^{commit}`], {
  cwd: repoRoot,
  stdio: 'pipe',
});

const files = new Map([
  [
    'std-lifecycle-effect-owned-metal-runner.mjs',
    'scripts/holo-ci/std-lifecycle-effect-owned-metal-runner.mjs',
  ],
  [
    'std-lifecycle-effects.v0.json',
    'packages/std/conformance/generated/std-lifecycle-effects.v0.json',
  ],
  [
    'std-host-binding.mjs',
    'packages/std/conformance/host-abi/std-host-binding.mjs',
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
  ['packaged-math.hsplus', 'packages/std/src/math.hsplus'],
  ['packaged-collections.hsplus', 'packages/std/src/collections.hsplus'],
]);
const pins = {};
for (const [bundleName, repoRelative] of files) {
  const worktreeBytes = readFileSync(
    join(repoRoot, ...repoRelative.split('/'))
  );
  let commitBytes;
  try {
    commitBytes = execFileSync(
      'git',
      ['show', `${sourceCommit}:${repoRelative}`],
      {
        cwd: repoRoot,
        encoding: null,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
  } catch {
    fail(`${repoRelative} is absent from source commit ${sourceCommit}`);
  }
  if (!worktreeBytes.equals(commitBytes)) {
    fail(`${repoRelative} differs from source commit ${sourceCommit}`);
  }
  const outputPath = join(outDir, ...bundleName.split('/'));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, worktreeBytes);
  pins[bundleName] = {
    sourcePath: repoRelative,
    sha256: sha256(worktreeBytes),
  };
}
const manifest = {
  schema: 'holoscript.std-lifecycle-effect-owned-metal-bundle.v0',
  sourceCommit,
  evaluatorExport: 'evaluate_trait_spawn_v1',
  packagedSources: {
    'packages/std/src/math.hsplus': 'packaged-math.hsplus',
    'packages/std/src/collections.hsplus': 'packaged-collections.hsplus',
  },
  files: pins,
};
writeFileSync(
  join(outDir, 'bundle-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(
  `[build-std-lifecycle-owned-metal] OK: ${Object.keys(pins).length} commit-bound files from ${sourceCommit}`
);
