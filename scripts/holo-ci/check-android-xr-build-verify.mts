#!/usr/bin/env tsx
// Build-verify gate for compile_to_android_xr — proves the FRESHLY EMITTED source BUILDS.
//
// The golden-diff gate (check-android-xr-emit-matches-reference.mts) proves the emit byte-matches the
// committed reference. This gate goes one step further (F.126: validation IS construction): it takes
// the freshly emitted AndroidXRCompiler.compileToFiles() output, writes it over a throwaway copy of the
// committed gradle skeleton, and runs the real `gradle assembleDebug`. It exercises the shared
// build-verify runner (scripts/holo-ci/build-verify/build-verify.mts).
//
// Degrades gracefully: with no Android toolchain it reports SKIPPED (exit 0) after proving the file map
// writes cleanly over the skeleton. With { requireToolchain: true } (CI) a missing toolchain FAILs.
//
// NOTE (W.802/c2e5bcb43): the build harness is REAL and resolves AGP/Kotlin/Compose/Filament/ARCore;
// it currently fails at checkDebugAarMetadata on the codegen's placeholder androidx.xr coordinate.
// Codegen-correctness is the scoped next gate. Use --require-toolchain only once codegen is buildable.
//
//   npx tsx scripts/holo-ci/check-android-xr-build-verify.mts                    # skip if no toolchain
//   npx tsx scripts/holo-ci/check-android-xr-build-verify.mts --require-toolchain # CI: toolchain mandatory
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidXRCompiler } from '../../packages/core/src/compiler/AndroidXRCompiler';
import {
  ANDROID_XR_PACKAGE,
  ANDROID_XR_ACTIVITY,
} from '../../apps/android-xr-reference/compile-config.mts';
import { parseOrDie } from './build-verify/golden-diff.mts';
import { runBuildVerifyGate } from './build-verify/build-verify.mts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'android-xr-reference');

const emitted = new AndroidXRCompiler({
  packageName: ANDROID_XR_PACKAGE,
  activityName: ANDROID_XR_ACTIVITY,
}).compileToFiles(parseOrDie(join(appDir, 'scene.holo'), 'scene.holo'), '');

runBuildVerifyGate({
  target: 'android-xr',
  emitted,
  skeletonDir: join(appDir, 'android-xr'),
  buildCommand: ['./gradlew', 'assembleDebug', '--no-daemon', '--console=plain'],
  // gradle needs a JDK; without one this SKIPs (unless --require-toolchain).
  toolchainProbe: { command: ['java', '-version'] },
  expectArtifacts: ['app/build/outputs/apk/debug'],
  requireToolchain: process.argv.includes('--require-toolchain'),
});
