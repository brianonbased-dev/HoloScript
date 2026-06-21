#!/usr/bin/env tsx
// Build-verify gate for compile_to_android (legacy plain-Android / ARCore) — proves the FRESHLY
// EMITTED AndroidCompiler output BUILDS, not just byte-matches the reference. Mirrors
// check-android-xr-build-verify.mts + check-quest-build-verify.mts via the shared build-verify runner.
//
// STATUS (2026-06-21): compile_to_android codegen is RED — "HARNESS GREEN, CODEGEN RED" with 4 emitter
// blockers documented in apps/android-reference/README.md (Groovy DSL emitted into a .kts file; compose
// true without the compose-compiler plugin; package= in AndroidManifest.xml removed in AGP 8; deprecated
// Sceneform fork). So with a JDK this currently FAILs at gradle configure — that failure IS the
// codegen-fix signal. It SKIPs gracefully without a JDK (never blocks a commit). Use --require-toolchain
// in CI / a scheduled job only once the AndroidCompiler emit is buildable.
//
// On-device verify (real ARCore session on a Galaxy S23) is a SEPARATE on-demand step, blocked today on
// (a) the S23 being connected via adb and (b) this codegen going green. See config/sovereign-devices/
// galaxy-s23.json (status: planned).
//
//   npx tsx scripts/holo-ci/check-android-build-verify.mts                    # skip if no toolchain
//   npx tsx scripts/holo-ci/check-android-build-verify.mts --require-toolchain # CI: toolchain mandatory
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidCompiler } from '../../packages/core/src/compiler/AndroidCompiler';
import { ANDROID_PACKAGE, ANDROID_CLASS } from '../../apps/android-reference/compile-config.mts';
import { parseOrDie } from './build-verify/golden-diff.mts';
import { runBuildVerifyGate } from './build-verify/build-verify.mts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'android-reference');

const emitted = new AndroidCompiler({
  packageName: ANDROID_PACKAGE,
  className: ANDROID_CLASS,
}).compileToFiles(parseOrDie(join(appDir, 'scene.holo'), 'scene.holo'), '');

runBuildVerifyGate({
  target: 'android',
  emitted,
  skeletonDir: join(appDir, 'android'),
  buildCommand: ['./gradlew', 'assembleDebug', '--no-daemon', '--console=plain'],
  toolchainProbe: { command: ['java', '-version'] },
  expectArtifacts: ['app/build/outputs/apk/debug'],
  requireToolchain: process.argv.includes('--require-toolchain'),
});
