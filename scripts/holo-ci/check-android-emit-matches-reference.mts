#!/usr/bin/env tsx
// Golden gate for compile_to_android (legacy plain-Android / ARCore) — NATIVE compiler path.
//
// Parses apps/android-reference/scene.holo through the REAL HoloCompositionParser and compiles it
// through the in-core AndroidCompiler (compileToFiles → path-keyed Android project layout). FAILS on
// any drift between the emitted files and the committed reference app (apps/android-reference/android).
// This is what enforces "edit the spec, not the generated Kotlin": hand-edit a generated .kt instead
// of scene.holo (or edit scene.holo without re-running generate-native.mts) and this goes red. CRLF is
// normalised so git autocrlf can't cause false drift.
//
// All shared gate logic (parse, byte-compare, first-diff report, --self-test) lives in
// scripts/holo-ci/build-verify/golden-diff.mts; this file is config only.
//
//   npx tsx scripts/holo-ci/check-android-emit-matches-reference.mts            # real gate
//   npx tsx scripts/holo-ci/check-android-emit-matches-reference.mts --self-test # prove it detects drift
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidCompiler } from '../../packages/core/src/compiler/AndroidCompiler';
import { ANDROID_PACKAGE, ANDROID_CLASS } from '../../apps/android-reference/compile-config.mts';
import { parseOrDie, runGoldenDiffGate } from './build-verify/golden-diff.mts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'android-reference');

runGoldenDiffGate({
  target: 'android',
  refDir: join(appDir, 'android'),
  emit: () =>
    new AndroidCompiler({
      packageName: ANDROID_PACKAGE,
      className: ANDROID_CLASS,
    }).compileToFiles(parseOrDie(join(appDir, 'scene.holo'), 'scene.holo'), ''),
  fixHint:
    'edit apps/android-reference/scene.holo (not the generated Kotlin), then re-run apps/android-reference/generate-native.mts.',
});
