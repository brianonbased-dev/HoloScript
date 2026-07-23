import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const requireFromPackage = createRequire(import.meta.url);
const releaseManifestPath = join(packageRoot, 'release-manifest.json');
export const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
const knownPlatformPackages = {
  'darwin-arm64': '@holoscript/systems-darwin-arm64',
  'linux-x64': '@holoscript/systems-linux-x64',
  'win32-x64': '@holoscript/systems-win32-x64',
};
const platformPackages = Object.freeze(
  Object.fromEntries(
    Object.entries(knownPlatformPackages).filter(([host]) =>
      Object.hasOwn(releaseManifest.platformPackages || {}, host)
    )
  )
);

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
    const expectedIdentity = releaseManifest.platformPackages?.[host]?.package || platformPackage;
    throw new Error(
      `@holoscript/systems@${distribution.version} could not resolve ` +
        `${expectedIdentity}; reinstall without omitting optional dependencies`
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
