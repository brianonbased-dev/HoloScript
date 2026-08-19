import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseH3OStack,
  runCharacterAppearanceH3O,
  validateH3OContract,
} from '../check-hololand-model-village-character-appearance-h3o.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const OUTPUT_DIR = path.join(ROOT, '.tmp/hololand/model-village/character-appearance-h3o-test');

test('H3O parses all three HoloScript formats and pins the sovereign native path', async () => {
  assert.equal(existsSync(HOLOSCRIPT_ROOT), true, `missing HoloScript root: ${HOLOSCRIPT_ROOT}`);
  const stack = await parseH3OStack(ROOT, HOLOSCRIPT_ROOT, OUTPUT_DIR);
  try {
    const validation = validateH3OContract(stack, ROOT, HOLOSCRIPT_ROOT);
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
    assert.equal(stack.manifest?.success, true);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3O renders four source-authored hand plates through native WebGPU readback', async () => {
  const { receipt } = await runCharacterAppearanceH3O({
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
    assert.equal(plate.materialReceipt.roleCounts['keratin-nail'], 10);
    assert.equal(plate.materialReceipt.skinNailOverlapIndexCount, 0);
    assert.equal(plate.materialReceipt.nailSeparatedFromSkin, true);
    assert.equal(plate.detailFrame.vertexRangeCount, 10);
    assert.ok(plate.figurePixelCount > 100);
    assert.ok(plate.changedPixelCount > 5);
    assert.ok(plate.absoluteChannelDiff > 100);
    assert.equal(plate.counterfactualChangedGeometry, false);
    assert.equal(plate.counterfactualChangedOnlyMaterialRole, 'keratin-nail');
    assert.match(plate.timingClassification, /not_gpu_timestamp_not_rtx_benchmark/);
  }
  assert.equal(receipt.boundaries.browserWebgpuMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampFrameTimeClaimed, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
