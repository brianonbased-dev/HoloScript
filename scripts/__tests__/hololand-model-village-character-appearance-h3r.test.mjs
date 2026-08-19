import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseH3RStack,
  runCharacterAppearanceH3R,
  validateH3RContract,
} from '../check-hololand-model-village-character-appearance-h3r.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const OUTPUT_DIR = path.join(ROOT, '.tmp/hololand/model-village/character-appearance-h3r-test');

test('H3R parses all HoloScript formats and pins four distinct source poses', async () => {
  assert.equal(existsSync(HOLOSCRIPT_ROOT), true, `missing HoloScript root: ${HOLOSCRIPT_ROOT}`);
  const stack = await parseH3RStack(ROOT, HOLOSCRIPT_ROOT, OUTPUT_DIR);
  try {
    const validation = validateH3RContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.deepEqual(validation, {
      status: 'pass',
      errors: [],
      plan: validation.plan,
    });
    assert.deepEqual(
      validation.plan.map((resident) => resident.displayLabel),
      ['OpenAI', 'Claude', 'Gemini', 'Grok']
    );
    assert.equal(new Set(validation.plan.map((resident) => resident.poseName)).size, 4);
    assert.equal(stack.source.success, true);
    assert.equal(stack.policy.success, true);
    assert.equal(stack.seed.success, true);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3R carries source pose and dual-influence ABI into native fixed-light pixels', async () => {
  const { receipt } = await runCharacterAppearanceH3R({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
    outputDir: OUTPUT_DIR,
    requireManifest: false,
  });

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.compilerAdmission.residentCount, 4);
  for (const record of receipt.compilerAdmission.records) {
    assert.equal(record.pose.schemaVersion, 'holoscript.character-source-pose.v1');
    assert.equal(record.pose.boneCount, 8);
    assert.equal(
      record.jointDeformation.schemaVersion,
      'holoscript.agent-avatar-joint-deformation.v1'
    );
    assert.equal(record.jointDeformation.influencedVertexCount, 1008);
    assert.equal(record.secondaryInfluenceArrayLength, record.vertexCount);
    assert.equal(record.positiveSecondaryInfluenceCount, 1008);
    assert.equal(record.repeatedCompileByteIdentity, true);
  }
  assert.equal(receipt.nativeGpuAdmission.deviceExecutionMeasured, true);
  assert.equal(receipt.nativeGpuAdmission.runtime.backend, 'native_webgpu_dawn');
  assert.equal(receipt.nativeGpuAdmission.runtime.threeJsDependencyUsed, false);
  assert.equal(receipt.nativeGpuAdmission.plates.length, 4);
  for (const plate of receipt.nativeGpuAdmission.plates) {
    assert.equal(plate.nativeGpuReadback, true);
    assert.equal(plate.sourcePose.schemaVersion, 'holoscript.character-source-pose.v1');
    assert.equal(
      plate.jointDeformation.schemaVersion,
      'holoscript.agent-avatar-joint-deformation.v1'
    );
    assert.ok(plate.counterfactuals.primaryOnly.changedPixelCount > 0);
    assert.ok(plate.counterfactuals.primaryOnly.absoluteChannelDiff > 0);
    assert.equal(plate.counterfactuals.primaryOnly.changedGeometry, false);
    assert.ok(plate.counterfactuals.neutralPose.changedPixelCount > 0);
    assert.ok(plate.counterfactuals.neutralPose.absoluteChannelDiff > 0);
    assert.equal(plate.counterfactuals.neutralPose.testOnly, true);
    for (const role of ['skin', 'keratin-nail', 'nail-bed']) {
      assert.ok(plate.counterfactuals.materialRoles[role].changedPixelCount > 0);
      assert.equal(plate.counterfactuals.materialRoles[role].changedGeometry, false);
    }
    assert.ok(plate.figurePixelCount > 100);
    assert.match(plate.timingClassification, /not_gpu_timestamp_not_rtx_benchmark/);
  }
  assert.equal(receipt.boundaries.runtimePoseMutationUsed, false);
  assert.equal(receipt.boundaries.browserWebgpuMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampFrameTimeClaimed, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
