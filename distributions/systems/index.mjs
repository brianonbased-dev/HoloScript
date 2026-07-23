import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const releaseManifestPath = join(packageRoot, 'release-manifest.json');

export const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
export const distribution = Object.freeze({
  id: releaseManifest.distributionId,
  version: releaseManifest.version,
  channel: releaseManifest.channel,
  machineContract: releaseManifest.machineContract,
  sourceCommit: releaseManifest.sourceCommit,
});
export const nativeCompilerPath = join(packageRoot, 'native', 'win32-x64', 'holoscriptc.exe');
export const wasmModulePath = join(packageRoot, 'wasm', 'index.cjs');
export const conformanceSourcePath = join(
  packageRoot,
  'conformance',
  'conditional-borrow-summary-exit-five.hs'
);

export function assertSupportedHost() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(
      `@holoscript/systems@${distribution.version} supports win32-x64; ` +
        `received ${process.platform}-${process.arch}`
    );
  }
  if (!existsSync(nativeCompilerPath)) {
    throw new Error(`Bundled native compiler is missing: ${nativeCompilerPath}`);
  }
  return true;
}
