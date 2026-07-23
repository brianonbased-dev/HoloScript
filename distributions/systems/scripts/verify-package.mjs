import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const releaseManifestPath = resolve(root, 'release-manifest.json');

const required = [
  'bin/holoscript.cjs',
  'bin/holoscriptc.cjs',
  'conformance/conditional-borrow-summary-exit-five.hs',
  'native/win32-x64/holoscriptc.exe',
  'wasm/index.cjs',
  'wasm/holoscript_wasm.js',
  'wasm/holoscript_wasm.d.ts',
  'wasm/holoscript_wasm_bg.wasm',
  'release-manifest.json',
  'SHA256SUMS',
  'LICENSE',
];

const errors = [];
if (manifest.name !== '@holoscript/systems' || manifest.version !== '0.1.0') {
  errors.push('package identity must remain @holoscript/systems@0.1.0');
}
if (manifest.dependencies?.['@holoscript/core'] !== '8.0.17') {
  errors.push('@holoscript/core must remain exactly pinned to 8.0.17');
}
if (manifest.dependencies?.['@holoscript/cli'] !== '8.0.11') {
  errors.push('@holoscript/cli must remain exactly pinned to 8.0.11');
}

for (const relativePath of required) {
  const path = resolve(root, relativePath);
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    errors.push(`missing or empty release file: ${relativePath}`);
  }
}

if (existsSync(releaseManifestPath)) {
  const release = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
  if (release.distributionId !== 'holoscript-systems-toolchain' || release.version !== '0.1.0') {
    errors.push('embedded release manifest identity mismatch');
  }
  if (!/^[0-9a-f]{40}$/u.test(String(release.sourceCommit || ''))) {
    errors.push('embedded release manifest sourceCommit must be a full Git commit');
  }
}

const sumsPath = resolve(root, 'SHA256SUMS');
if (existsSync(sumsPath)) {
  for (const line of readFileSync(sumsPath, 'utf8').trim().split(/\r?\n/u)) {
    const match = /^([0-9a-f]{64})  (.+)$/u.exec(line);
    if (!match) {
      errors.push(`invalid SHA256SUMS line: ${line}`);
      continue;
    }
    const path = resolve(root, match[2]);
    if (!existsSync(path)) {
      errors.push(`SHA256SUMS path is missing: ${match[2]}`);
      continue;
    }
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actual !== match[1]) errors.push(`SHA256 mismatch: ${match[2]}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[systems-package] ${error}`);
  process.exit(1);
}

console.log('[systems-package] package identity, files, and digests verified');
