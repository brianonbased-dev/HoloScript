import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveHoloScriptRoot } from '../lib/model-village-holoscript-root.mjs';

import {
  parseH3TStack,
  runCharacterAppearanceH3T,
  validateH3TContract,
} from '../check-hololand-model-village-character-appearance-h3t.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3T.TEST',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/h3t-skin-surface-runtime'],
});
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];

test('H3T parses all three HoloScript formats and admits the pinned source contract', async () => {
  const stack = await parseH3TStack(ROOT, HOLOSCRIPT_ROOT);
  try {
    assert.equal(stack.source.success, true);
    assert.equal(stack.policy.success, true);
    assert.equal(stack.seed.success, true);

    const validation = validateH3TContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.deepEqual(validation.errors, []);
    assert.equal(validation.status, 'pass');
    assert.deepEqual(
      validation.plan.map((resident) => resident.displayLabel),
      EXPECTED_RESIDENTS
    );
    for (const resident of validation.plan) {
      assert.ok(resident.albedoVariationStrength > 0);
      assert.ok(resident.roughnessVariationStrength > 0);
      assert.ok(resident.normalMicrodetailStrength > 0);
    }
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3T proves each independent skin channel and the retained V5 nail-bed transition on native Dawn', async () => {
  const { receipt } = await runCharacterAppearanceH3T({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });

  assert.equal(
    receipt.schema,
    'hololand.model-village.character-appearance-h3t-witness.v1'
  );
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.compilerAdmission.residentCount, 4);
  assert.deepEqual(receipt.compilerAdmission.residentNames, EXPECTED_RESIDENTS);
  assert.equal(receipt.nativeGpuAdmission.runtime.backend, 'native_webgpu_dawn');
  assert.equal(receipt.nativeGpuAdmission.runtime.browserUsed, false);
  assert.equal(receipt.nativeGpuAdmission.plates.length, 4);

  for (const plate of receipt.nativeGpuAdmission.plates) {
    assert.equal(
      plate.skinReceipt.schemaVersion,
      'holoscript.agent-avatar-skin-material.v3'
    );
    assert.equal(plate.skinReceipt.surfaceResponseProfile, 'calibrated-skin-surface-v1');
    assert.ok(plate.skinReceipt.albedoVariationStrength > 0);
    assert.ok(plate.skinReceipt.roughnessVariationStrength > 0);
    assert.ok(plate.skinReceipt.normalMicrodetailStrength > 0);
    assert.equal(
      plate.handSurface.schemaVersion,
      'holoscript.agent-avatar-hand-surface.v1'
    );
    assert.equal(plate.materialReceipt.skinNailOverlapIndexCount, 0);
    assert.equal(plate.materialReceipt.skinNailBedOverlapIndexCount, 0);
    assert.equal(plate.materialReceipt.nailBedKeratinOverlapIndexCount, 0);
    assert.equal(plate.materialReceipt.calibratedNailSurface, true);
    assert.ok(plate.shadowReadability.p90MinusP10 >= 12);

    for (const key of ['albedo', 'roughness', 'fineNormal', 'nailBedTransition']) {
      assert.ok(plate.counterfactuals[key].changedPixelCount > 0);
      assert.ok(plate.counterfactuals[key].absoluteChannelDiff > 0);
      assert.equal(plate.counterfactuals[key].changedGeometry, false);
    }
  }

  assert.equal(receipt.nativeGpuAdmission.adapter.timestampQueryMeasured, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
  assert.equal(receipt.boundaries.browserWebgpuMeasured, false);
  assert.equal(receipt.boundaries.questWebxrMeasured, false);
  assert.equal(receipt.boundaries.productionSkinTexturingClaimed, false);
  assert.equal(receipt.boundaries.measuredTissueModelClaimed, false);
  assert.equal(receipt.boundaries.photorealismClaimed, false);
});
