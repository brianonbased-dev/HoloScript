import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveHoloScriptRoot } from '../lib/model-village-holoscript-root.mjs';

import {
  parseH3VStack,
  runCharacterAppearanceH3V,
  validateH3VContract,
} from '../check-hololand-model-village-character-appearance-h3v.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3V.TEST',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3v-portrait-anatomy'],
});
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];

test('H3V parses all formats and pins portrait-anatomy claim boundaries', async () => {
  const stack = await parseH3VStack(ROOT, HOLOSCRIPT_ROOT);
  try {
    assert.equal(stack.h3vSource.success, true);
    assert.equal(stack.h3vPolicy.success, true);
    assert.equal(stack.h3vSeed.success, true);
    const validation = validateH3VContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.deepEqual(validation.errors, []);
    assert.deepEqual(
      validation.plan.map((resident) => resident.displayLabel),
      EXPECTED_RESIDENTS
    );
    assert.equal(stack.h3vContract.state.browserWebgpuMeasured, true);
    assert.equal(stack.h3vContract.state.sourcePoseApplied, true);
    assert.equal(stack.h3vContract.state.questHeadsetMeasured, false);
    assert.equal(stack.h3vContract.state.freshRtxBenchmarkClaimed, false);
    assert.equal(stack.h3vContract.state.photorealismClaimed, false);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3V witnesses native Chrome WebGPU portraits with authored shoulders and arms', async () => {
  const { receipt } = await runCharacterAppearanceH3V({
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
    assert.equal(compiler.upperBodyProfile, 'portrait-anatomy-v6');
    assert.equal(compiler.facialLandmarks.profile, 'portrait-silhouette-v2');
    assert.equal(compiler.pose.name, 'portrait_arms_down');
    assert.equal(compiler.pose.boneCount, 4);
    assert.equal(compiler.superiorContourScaleMin, 0.15);
    assert.equal(compiler.jointDeformation.regionVertexCounts.shoulder, 288);
    assert.equal(compiler.jointDeformation.influencedVertexCount, 1200);
  }
  for (const resident of receipt.browserWebgpuAdmission.residents) {
    assert.ok(resident.metrics.nonBackgroundPixelCount > 5000);
    assert.ok(resident.metrics.luminanceRange >= 35);
  }
  assert.equal(receipt.boundaries.browserWebgpuMeasured, true);
  assert.equal(receipt.boundaries.sourcePoseApplied, true);
  assert.equal(receipt.boundaries.portraitShoulderVolumeReceipted, true);
  assert.equal(receipt.boundaries.portraitFaceSilhouetteReceipted, true);
  assert.equal(receipt.boundaries.questHeadsetMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampMeasured, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
