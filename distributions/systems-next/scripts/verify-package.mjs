import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const errors = [];
const expectedPlatformsByVersion = {
  '0.2.0': {
    '@holoscript/systems-linux-x64': '0.2.0',
    '@holoscript/systems-win32-x64': '0.2.0',
  },
  '0.3.0': {
    '@holoscript/systems-darwin-arm64': '0.3.0',
    '@holoscript/systems-linux-x64': '0.2.0',
    '@holoscript/systems-win32-x64': '0.2.0',
  },
};
const expectedPlatforms = expectedPlatformsByVersion[manifest.version];

function filesRecursively(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

if (manifest.name !== '@holoscript/systems' || !expectedPlatforms) {
  errors.push(
    `package identity must be a supported @holoscript/systems candidate; found ${manifest.name}@${manifest.version}`
  );
}
if (
  expectedPlatforms &&
  JSON.stringify(manifest.optionalDependencies) !== JSON.stringify(expectedPlatforms)
) {
  errors.push('platform optionalDependencies must remain exact and complete');
}
if (manifest.os || manifest.cpu) {
  errors.push('the systems meta package must remain platform-neutral');
}
if (manifest.dependencies?.['@holoscript/core'] !== '8.0.17') {
  errors.push('@holoscript/core must remain exactly pinned to 8.0.17');
}
if (manifest.dependencies?.['@holoscript/cli'] !== '8.0.11') {
  errors.push('@holoscript/cli must remain exactly pinned to 8.0.11');
}

for (const relativePath of [
  'bin/holoscript.cjs',
  'bin/holoscriptc.cjs',
  'conformance/multi-file-modules/entry.hs',
  'conformance/multi-file-modules/math.hs',
  'wasm/index.cjs',
  'wasm/holoscript_wasm_bg.wasm',
  'release-manifest.json',
  'SHA256SUMS',
  'LICENSE',
]) {
  const path = resolve(root, relativePath);
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    errors.push(`missing or empty release file: ${relativePath}`);
  }
}

const conformancePrograms = filesRecursively(resolve(root, 'conformance')).filter((path) =>
  path.endsWith('.hs')
);
if (conformancePrograms.length < 27) {
  errors.push(`cumulative conformance corpus has only ${conformancePrograms.length} programs`);
}

const releaseManifestPath = resolve(root, 'release-manifest.json');
if (existsSync(releaseManifestPath)) {
  const release = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
  if (
    release.distributionId !== 'holoscript-systems-toolchain' ||
    release.version !== manifest.version ||
    release.machineContract !== 'hs-machine-v33'
  ) {
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
console.error(
  `[systems-package] ${manifest.name}@${manifest.version} identity, platform split, files, and digests verified`
);
