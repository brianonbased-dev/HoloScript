import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveHoloScriptRoot } from '../lib/model-village-holoscript-root.mjs';

import {
  parseH3WStack,
  runCharacterAppearanceH3W,
  validateH3WContract,
} from '../check-hololand-model-village-character-appearance-h3w.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3W.TEST',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3w-expressive-scapular-lighting'],
});
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];

test('H3W parses all formats and pins expressive-lighting claim boundaries', async () => {
  const stack = await parseH3WStack(ROOT, HOLOSCRIPT_ROOT);
  try {
    assert.equal(stack.h3wSource.success, true);
    assert.equal(stack.h3wPolicy.success, true);
    assert.equal(stack.h3wSeed.success, true);
    const validation = validateH3WContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.deepEqual(validation.errors, []);
    assert.deepEqual(
      validation.plan.map((resident) => resident.displayLabel),
      EXPECTED_RESIDENTS
    );
    assert.equal(stack.h3wContract.state.browserWebgpuMeasured, true);
    assert.equal(stack.h3wContract.state.sourcePoseApplied, true);
    assert.equal(stack.h3wContract.state.questHeadsetMeasured, false);
    assert.equal(stack.h3wContract.state.freshRtxBenchmarkClaimed, false);
    assert.equal(stack.h3wContract.state.photorealismClaimed, false);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3W witnesses expressive anatomy and three-point material response in Chrome WebGPU', async () => {
  const { receipt } = await runCharacterAppearanceH3W({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
    skipManifest: true,
  });
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.compilerAdmission.residentCount, 4);
  assert.equal(receipt.compilerAdmission.repeatedCompileByteIdentity, true);
  assert.equal(receipt.compilerAdmission.secondaryJointWeightsSerialized, true);
  assert.equal(receipt.browserWebgpuAdmission.gpu.navigatorGpu, true);
  assert.equal(receipt.browserWebgpuAdmission.gpu.adapterAcquired, true);
  assert.equal(receipt.browserWebgpuAdmission.gpu.deviceCreated, true);
  assert.deepEqual(
    receipt.browserWebgpuAdmission.residents.map((resident) => resident.displayLabel),
    EXPECTED_RESIDENTS
  );
  for (const compiler of receipt.compilerAdmission.records) {
    assert.equal(compiler.upperBodyProfile, 'expressive-anatomy-v7');
    assert.equal(compiler.facialLandmarks.profile, 'portrait-silhouette-v2');
    assert.equal(compiler.pose.name, 'civic_conversation');
    assert.equal(compiler.pose.boneCount, 5);
    assert.equal(compiler.jointDeformation.profile, 'expressive-neck-scapular-volume-v3');
    assert.equal(compiler.jointDeformation.regionVertexCounts.neck, 96);
    assert.equal(compiler.jointDeformation.expressiveAsymmetry.neckBlendRingCount, 4);
    assert.deepEqual(
      compiler.jointDeformation.expressiveAsymmetry.neckInfluenceWeights,
      [0.08, 0.22, 0.45, 0.2]
    );
    assert.equal(compiler.expression.schemaVersion, 'holoscript.native-facial-morph.v2');
    assert.ok(compiler.expression.appliedTargets.length >= 5);
    assert.equal(compiler.environmentLight.profile, 'analytic-three-point-v1');
  }
  for (const resident of receipt.browserWebgpuAdmission.residents) {
    assert.ok(resident.metrics.nonBackgroundPixelCount > 5000);
    assert.ok(resident.metrics.luminanceRange >= 35);
    assert.ok(resident.environmentDifference.changedPixelCount > 25);
    assert.ok(resident.environmentDifference.absoluteChannelDifference > 1000);
  }
  assert.equal(receipt.boundaries.browserWebgpuMeasured, true);
  assert.equal(receipt.boundaries.sourcePoseApplied, true);
  assert.equal(receipt.boundaries.expressiveNeckScapularVolumeReceipted, true);
  assert.equal(receipt.boundaries.sourceExpressionApplied, true);
  assert.equal(receipt.boundaries.portraitFaceSilhouetteReceipted, true);
  assert.equal(receipt.boundaries.analyticThreePointEnvironmentReceipted, true);
  assert.equal(receipt.boundaries.environmentCounterfactualRendered, true);
  assert.equal(receipt.boundaries.questHeadsetMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampMeasured, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
