#!/usr/bin/env tsx
// Golden gate for compile_to_android_xr (Jetpack XR / headset) — NATIVE compiler path.
//
// Parses apps/android-xr-reference/scene.holo through the REAL HoloCompositionParser and compiles it
// through the in-core AndroidXRCompiler (compileToFiles → path-keyed Android project layout). FAILS on
// any drift between the emitted files and the committed reference app (apps/android-xr-reference/
// android-xr). This is what enforces "edit the spec, not the generated Kotlin": hand-edit a generated
// .kt instead of scene.holo (or edit scene.holo without re-running generate-native.mts) and this goes
// red. CRLF is normalised so git autocrlf can't cause false drift.
//
// All shared gate logic (parse, byte-compare, first-diff report, --self-test) lives in
// scripts/holo-ci/build-verify/golden-diff.mts; this file is config only.
//
//   npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts            # real gate
//   npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts --self-test # prove it detects drift
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidXRCompiler } from '../../packages/core/src/compiler/AndroidXRCompiler';
import {
  ANDROID_XR_PACKAGE,
  ANDROID_XR_ACTIVITY,
} from '../../apps/android-xr-reference/compile-config.mts';
import { parseOrDie, runGoldenDiffGate } from './build-verify/golden-diff.mts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'android-xr-reference');

runGoldenDiffGate({
  target: 'android-xr',
  refDir: join(appDir, 'android-xr'),
  emit: () =>
    new AndroidXRCompiler({
      packageName: ANDROID_XR_PACKAGE,
      activityName: ANDROID_XR_ACTIVITY,
    }).compileToFiles(parseOrDie(join(appDir, 'scene.holo'), 'scene.holo'), ''),
  fixHint:
    'edit apps/android-xr-reference/scene.holo (not the generated Kotlin), then re-run apps/android-xr-reference/generate-native.mts.',
});
