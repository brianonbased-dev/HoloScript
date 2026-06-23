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
// NOTE (task_1781992603676_l7g7): the build harness is REAL and now compile-checks the emitted
// Jetpack XR Kotlin through Gradle assembleDebug. Use --require-toolchain in CI/fleet contexts where
// a JDK + Android SDK are mandatory; the default local path still skips cleanly without them.
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
const javaCommand = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  : 'java';

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
  toolchainProbe: { command: [javaCommand, '-version'] },
  expectArtifacts: ['app/build/outputs/apk/debug'],
  requireToolchain: process.argv.includes('--require-toolchain'),
});
