import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseH3SStack,
  runCharacterAppearanceH3S,
  validateH3SContract,
} from '../check-hololand-model-village-character-appearance-h3s.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const OUTPUT_DIR = path.join(ROOT, '.tmp/hololand/model-village/character-appearance-h3s-test');

test('H3S parses .holo, .hsplus, and .hs with four topology-only V4 derivations', async () => {
  assert.equal(existsSync(HOLOSCRIPT_ROOT), true, `missing HoloScript root: ${HOLOSCRIPT_ROOT}`);
  const stack = await parseH3SStack(ROOT, HOLOSCRIPT_ROOT, OUTPUT_DIR);
  try {
    const validation = validateH3SContract(stack, ROOT, HOLOSCRIPT_ROOT);
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
    assert.equal(stack.v4Source.success, true);
    assert.equal(stack.policy.success, true);
    assert.equal(stack.seed.success, true);
    assert.equal(stack.sourceText.split('coherent_hand_surface_v5').length - 1, 4);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3S carries the V5 hand receipt through compiler, host, and native pixels', async () => {
  const { receipt } = await runCharacterAppearanceH3S({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
    outputDir: OUTPUT_DIR,
    requireManifest: false,
  });

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.compilerAdmission.residentCount, 4);
  for (const record of receipt.compilerAdmission.records) {
    assert.equal(record.repeatedV5CompileByteIdentity, true);
    assert.equal(record.vertexDelta, 1336);
    assert.equal(record.topologyOnlyCounterfactual, true);
    assert.equal(record.v5.handSurface.schemaVersion, 'holoscript.agent-avatar-hand-surface.v1');
    assert.equal(
      record.v5.handSurface.profile,
      'tapered-digit-commissure-cuticle-wrist-v1'
    );
    assert.equal(record.v5.handSurface.limbs.length, 2);
    assert.equal(record.v5.handSurface.regionVertexCounts.digitSections, 1690);
    assert.equal(record.v5.handSurface.regionIndexCounts.digitSections, 9720);
    assert.equal(record.v4.handSurface, null);
    assert.equal(record.v5.positiveSecondaryInfluenceCount, 1008);
    assert.equal(record.v4.positiveSecondaryInfluenceCount, 1008);
    assert.equal(record.v5.jointDeformation.jointPairCount, 38);
    assert.deepEqual(record.v5.pose, record.v4.pose);
    assert.deepEqual(record.v5.jointDeformation, record.v4.jointDeformation);
  }
  assert.equal(receipt.nativeGpuAdmission.deviceExecutionMeasured, true);
  assert.equal(receipt.nativeGpuAdmission.runtime.backend, 'native_webgpu_dawn');
  assert.equal(receipt.nativeGpuAdmission.runtime.threeJsDependencyUsed, false);
  assert.equal(receipt.nativeGpuAdmission.topologyPairs.length, 4);
  assert.equal(receipt.nativeGpuAdmission.contactSheet.columns, 2);
  assert.equal(receipt.nativeGpuAdmission.contactSheet.rows, 4);
  assert.deepEqual(receipt.nativeGpuAdmission.contactSheet.rowMeaning, [
    'OpenAI',
    'Claude',
    'Gemini',
    'Grok',
  ]);
  for (const pair of receipt.nativeGpuAdmission.topologyPairs) {
    assert.equal(pair.nativeGpuReadback, true);
    assert.equal(pair.topologyOnlyCounterfactual, true);
    assert.equal(pair.changedOnlySourceBodyField, 'upper_body_profile');
    assert.equal(pair.vertexDelta, 1336);
    assert.equal(pair.fixedInputs.poseChanged, false);
    assert.equal(pair.fixedInputs.materialsChanged, false);
    assert.equal(pair.fixedInputs.cameraChanged, false);
    assert.equal(pair.fixedInputs.lightChanged, false);
    assert.ok(pair.changedPixelCount > 20);
    assert.ok(pair.absoluteChannelDiff > 200);
    assert.ok(pair.v5FigurePixelCount > 100);
    assert.ok(pair.v4FigurePixelCount > 100);
    assert.match(pair.timingClassification, /not_gpu_timestamp_not_rtx_benchmark/);
  }
  assert.equal(receipt.nativeGpuAdmission.adapter.timestampQueryMeasured, false);
  assert.equal(receipt.boundaries.runtimePoseMutationUsed, false);
  assert.equal(receipt.boundaries.browserWebgpuMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampFrameTimeClaimed, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
