import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseH3QStack,
  runCharacterAppearanceH3Q,
  validateH3QContract,
} from '../check-hololand-model-village-character-appearance-h3q.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const OUTPUT_DIR = path.join(ROOT, '.tmp/hololand/model-village/character-appearance-h3q-test');

test('H3Q parses all three HoloScript formats and pins the sovereign fixed-light path', async () => {
  assert.equal(existsSync(HOLOSCRIPT_ROOT), true, `missing HoloScript root: ${HOLOSCRIPT_ROOT}`);
  const stack = await parseH3QStack(ROOT, HOLOSCRIPT_ROOT, OUTPUT_DIR);
  try {
    const validation = validateH3QContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.deepEqual(validation, {
      status: 'pass',
      errors: [],
      plan: validation.plan,
    });
    assert.deepEqual(
      validation.plan.map((resident) => resident.displayLabel),
      ['OpenAI', 'Claude', 'Gemini', 'Grok']
    );
    assert.equal(stack.source.success, true);
    assert.equal(stack.policy.success, true);
    assert.equal(stack.seed.success, true);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3Q proves skin, keratin, and nail-bed pixels through native fixed-light readback', async () => {
  const { receipt } = await runCharacterAppearanceH3Q({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
    outputDir: OUTPUT_DIR,
    requireManifest: false,
  });

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.compilerAdmission.residentCount, 4);
  assert.equal(receipt.nativeGpuAdmission.deviceExecutionMeasured, true);
  assert.equal(receipt.nativeGpuAdmission.runtime.backend, 'native_webgpu_dawn');
  assert.equal(receipt.nativeGpuAdmission.runtime.threeJsDependencyUsed, false);
  assert.equal(receipt.nativeGpuAdmission.plates.length, 4);
  for (const plate of receipt.nativeGpuAdmission.plates) {
    assert.equal(plate.nativeGpuReadback, true);
    assert.equal(plate.skinReceipt.calibrationProfile, 'fixed-light-human-v1');
    assert.equal(plate.materialReceipt.schemaVersion, 'holoscript.character-material-plate.v2');
    assert.equal(plate.materialReceipt.roleCounts['keratin-nail'], 20);
    assert.equal(plate.materialReceipt.roleCounts['nail-bed'], 10);
    assert.equal(plate.materialReceipt.keratinIndexCount, 2160);
    assert.equal(plate.materialReceipt.nailBedIndexCount, 720);
    assert.equal(plate.materialReceipt.nailSurfaceIndexCount, 2880);
    assert.equal(plate.materialReceipt.skinNailOverlapIndexCount, 0);
    assert.equal(plate.materialReceipt.skinNailBedOverlapIndexCount, 0);
    assert.equal(plate.materialReceipt.nailBedKeratinOverlapIndexCount, 0);
    assert.equal(plate.materialReceipt.calibratedNailSurface, true);
    for (const role of ['skin', 'keratin-nail', 'nail-bed']) {
      assert.ok(plate.counterfactuals[role].changedPixelCount > 0);
      assert.ok(plate.counterfactuals[role].absoluteChannelDiff > 0);
      assert.equal(plate.counterfactuals[role].changedGeometry, false);
    }
    assert.ok(plate.figurePixelCount > 100);
    assert.match(plate.timingClassification, /not_gpu_timestamp_not_rtx_benchmark/);
  }
  assert.equal(receipt.boundaries.browserWebgpuMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampFrameTimeClaimed, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.measuredTissueModelClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
