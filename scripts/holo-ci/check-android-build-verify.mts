#!/usr/bin/env tsx
// Build-verify gate for compile_to_android (legacy plain-Android / ARCore) — proves the FRESHLY
// EMITTED AndroidCompiler output BUILDS, not just byte-matches the reference. Mirrors
// check-android-xr-build-verify.mts + check-quest-build-verify.mts via the shared build-verify runner.
//
// STATUS: GREEN since the SceneView 4.18.0 retarget (2026-06-21) — the emit builds an APK, so a FAIL
// here is a real codegen regression, not an expected state. Re-proven 2026-09-27 with the reference
// scene covering all three node kinds: the pre-fix emitter failed compileDebugKotlin on
// CylinderNode(length = …) ("No parameter with name 'length' found"); the fixed emitter builds.
//
// Without `java` on PATH this reports SKIPPED and exits 0 — a skip is not a pass. On this laptop:
//   JAVA_HOME=/c/tools/jdk-17.0.19+10 ANDROID_HOME=/c/Android PATH="/c/tools/jdk-17.0.19+10/bin:$PATH" \
//     npx tsx scripts/holo-ci/check-android-build-verify.mts --require-toolchain
// --require-toolchain turns a missing toolchain into a FAIL (use it in CI / scheduled jobs).
//
// On-device verify (a real ARCore session on the Galaxy S23) is a separate on-demand step over adb;
// see apps/android-reference/README.md.
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
