import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const requireFromPackage = createRequire(import.meta.url);
const releaseManifestPath = join(packageRoot, 'release-manifest.json');
const platformPackages = Object.freeze({
  'linux-x64': '@holoscript/systems-linux-x64',
  'win32-x64': '@holoscript/systems-win32-x64',
});

export const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
export const distribution = Object.freeze({
  id: releaseManifest.distributionId,
  version: releaseManifest.version,
  channel: releaseManifest.channel,
  machineContract: releaseManifest.machineContract,
  sourceCommit: releaseManifest.sourceCommit,
});
export const wasmModulePath = join(packageRoot, 'wasm', 'index.cjs');
export const conformanceSourcePath = join(
  packageRoot,
  'conformance',
  'multi-file-modules',
  'entry.hs'
);

export function resolveNativeCompilerPath() {
  const host = `${process.platform}-${process.arch}`;
  const platformPackage = platformPackages[host];
  if (!platformPackage) {
    throw new Error(
      `@holoscript/systems@${distribution.version} does not support ${host}; ` +
        `supported hosts: ${Object.keys(platformPackages).join(', ')}`
    );
  }
  try {
    return requireFromPackage.resolve(`${platformPackage}/holoscriptc`);
  } catch {
    throw new Error(
      `@holoscript/systems@${distribution.version} could not resolve ` +
        `${platformPackage}@${distribution.version}; reinstall without omitting optional dependencies`
    );
  }
}

export const nativeCompilerPath = resolveNativeCompilerPath();

export function assertSupportedHost() {
  if (!existsSync(nativeCompilerPath)) {
    throw new Error(`Platform native compiler is missing: ${nativeCompilerPath}`);
  }
  return true;
}
