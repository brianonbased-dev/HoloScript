import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveHoloScriptRoot } from '../lib/model-village-holoscript-root.mjs';

import {
  parseH3XStack,
  runCharacterAppearanceH3X,
  validateH3XContract,
} from '../check-hololand-model-village-character-appearance-h3x.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3X.TEST',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3x-cranial-expression-normals-proof'],
});
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];

test('H3X parses all formats and pins cranial/expression-normal claim boundaries', async () => {
  const stack = await parseH3XStack(ROOT, HOLOSCRIPT_ROOT);
  try {
    assert.equal(stack.h3xSource.success, true);
    assert.equal(stack.h3xPolicy.success, true);
    assert.equal(stack.h3xSeed.success, true);
    const validation = validateH3XContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.deepEqual(validation.errors, []);
    assert.deepEqual(
      validation.plan.map((resident) => resident.displayLabel),
      EXPECTED_RESIDENTS
    );
    assert.equal(stack.h3xContract.state.browserWebgpuMeasured, true);
    assert.equal(stack.h3xContract.state.sourcePoseApplied, true);
    assert.equal(stack.h3xContract.state.expressionNormalCounterfactualRequired, true);
    assert.equal(stack.h3xContract.state.closeupLodCounterfactualRequired, true);
    assert.equal(stack.h3xContract.state.closeupFaceRadialSegments, 44);
    assert.equal(stack.h3xContract.state.distanceFaceRadialSegments, 24);
    assert.equal(stack.h3xContract.state.questHeadsetMeasured, false);
    assert.equal(stack.h3xContract.state.freshRtxBenchmarkClaimed, false);
    assert.equal(stack.h3xContract.state.photorealismClaimed, false);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3X witnesses cranial topology, normal recomputation, and facial LOD in Chrome WebGPU', async () => {
  const { receipt } = await runCharacterAppearanceH3X({
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
    assert.equal(compiler.facialLandmarks.profile, 'portrait-cranial-v3');
    assert.equal(compiler.facialLandmarks.radialSegments, 44);
    assert.equal(compiler.facialLandmarks.verticalSegments, 30);
    assert.equal(compiler.cranialNeck.profile, 'indexed-neck-cranium-stitch-v1');
    assert.equal(compiler.cranialNeck.bridgeTriangleCount, 68);
    assert.equal(compiler.closeupLod.faceRadialSegments, 44);
    assert.equal(compiler.closeupLod.faceVerticalSegments, 30);
    assert.equal(compiler.distanceLod.faceRadialSegments, 24);
    assert.equal(compiler.distanceLod.faceVerticalSegments, 16);
    assert.ok(compiler.closeupVertexCount > compiler.distanceVertexCount);
    assert.equal(compiler.positionCounterfactualByteIdentity, true);
    assert.equal(compiler.pose.name, 'civic_conversation');
    assert.equal(compiler.pose.boneCount, 5);
    assert.equal(compiler.jointDeformation.profile, 'expressive-cranial-neck-volume-v4');
    assert.equal(compiler.jointDeformation.regionVertexCounts.neck, 96);
    assert.equal(compiler.jointDeformation.regionVertexCounts.cranialNeck, 68);
    assert.equal(compiler.jointDeformation.expressiveAsymmetry.neckBlendRingCount, 4);
    assert.deepEqual(
      compiler.jointDeformation.expressiveAsymmetry.neckInfluenceWeights,
      [0.08, 0.22, 0.45, 0.2]
    );
    assert.equal(compiler.expression.schemaVersion, 'holoscript.native-facial-morph.v3');
    assert.equal(compiler.expression.normalPolicy, 'recompute-affected-v1');
    assert.equal(compiler.expression.normalsRecomputed, true);
    assert.ok(compiler.expression.normalAffectedVertexCount > 0);
    assert.ok(compiler.expression.normalChangedVertexCount > 0);
    assert.equal(compiler.staticNormalExpression.normalsRecomputed, false);
    assert.ok(compiler.expression.appliedTargets.length >= 5);
    assert.equal(compiler.environmentLight.profile, 'analytic-three-point-v1');
  }
  for (const resident of receipt.browserWebgpuAdmission.residents) {
    assert.ok(resident.metrics.nonBackgroundPixelCount > 5000);
    assert.ok(resident.metrics.luminanceRange >= 35);
    assert.ok(resident.environmentDifference.changedPixelCount > 25);
    assert.ok(resident.environmentDifference.absoluteChannelDifference > 1000);
    assert.ok(resident.expressionNormalDifference.changedPixelCount > 25);
    assert.ok(resident.expressionNormalDifference.absoluteChannelDifference > 1000);
    assert.ok(resident.closeupLodDifference.changedPixelCount > 25);
    assert.ok(resident.closeupLodDifference.absoluteChannelDifference > 1000);
  }
  assert.equal(receipt.boundaries.browserWebgpuMeasured, true);
  assert.equal(receipt.boundaries.sourcePoseApplied, true);
  assert.equal(receipt.boundaries.expressiveCranialNeckVolumeReceipted, true);
  assert.equal(receipt.boundaries.sourceExpressionApplied, true);
  assert.equal(receipt.boundaries.portraitCranialGeometryReceipted, true);
  assert.equal(receipt.boundaries.indexedCranialNeckStitchReceipted, true);
  assert.equal(receipt.boundaries.expressionNormalsRecomputed, true);
  assert.equal(receipt.boundaries.expressionNormalCounterfactualRendered, true);
  assert.equal(receipt.boundaries.closeupLodCounterfactualRendered, true);
  assert.equal(receipt.boundaries.faceLodBudgetsSourceAuthored, true);
  assert.equal(receipt.boundaries.analyticThreePointEnvironmentReceipted, true);
  assert.equal(receipt.boundaries.environmentCounterfactualRendered, true);
  assert.equal(receipt.boundaries.questHeadsetMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampMeasured, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
