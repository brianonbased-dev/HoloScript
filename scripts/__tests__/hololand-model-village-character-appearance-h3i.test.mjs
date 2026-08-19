import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3ITemporalLodBundles,
  parseH3IStack,
  validateH3IContract,
} from '../check-hololand-model-village-character-appearance-h3i.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3I parses all three formats and binds the anatomy and surface truth boundary', async () => {
  const stack = await parseH3IStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3IContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.deepEqual(stack.contract.state.anatomySurfaceFoundation, {
    anatomyReceiptSchema: 'holoscript.agent-avatar-anatomy.v1',
    skinReceiptSchema: 'holoscript.agent-avatar-skin-material.v2',
    skinCalibrationProfile: 'legacy-v1',
    skinDisclosureOnlyWidening: true,
    skinMicrodetailProfile: 'analytic-pore-v1',
    faceWidthRange: [0.93, 0.96],
    faceLengthRange: [1.05, 1.08],
    jawTaperRange: [0.28, 0.32],
    shoulderScaleRange: [1.08, 1.12],
    torsoScaleRange: [0.94, 0.97],
    crownWhorlRange: [-0.28, 0.42],
    microdetailScaleRange: [88, 102],
    microdetailStrengthRange: [0.065, 0.085],
    analyticTextureFreeNativeResponse: true,
    presentationProceduralNormalMap: true,
    presentationWardrobeBridge: 'three-tapered-civic-tunic-v1',
    presentationNativeTorsoClipPolicy: 'eye-height-minus-0.16-v1',
    externalSkinTexture: false,
    biometricLikeness: false,
  });
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
  );
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.personaId),
    ['hearth_keeper', 'path_tender', 'record_steward']
  );
  assert.deepEqual(
    validation.plan.personas.map(
      ({
        faceWidth,
        faceLength,
        jawTaper,
        shoulderScale,
        torsoScale,
        crownWhorl,
        microdetailScale,
        microdetailStrength,
      }) => [
        faceWidth,
        faceLength,
        jawTaper,
        shoulderScale,
        torsoScale,
        crownWhorl,
        microdetailScale,
        microdetailStrength,
      ]
    ),
    [
      [0.94, 1.07, 0.3, 1.12, 0.96, 0.42, 94, 0.075],
      [0.96, 1.05, 0.28, 1.1, 0.94, -0.28, 102, 0.085],
      [0.93, 1.08, 0.32, 1.08, 0.97, 0.34, 88, 0.065],
    ]
  );
});

test('H3I emits nine exact anatomy, crown, skin, and temporal receipts', async () => {
  const stack = await parseH3IStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3IContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const result = await compileH3ITemporalLodBundles(stack, validation.plan);
  const tiers = result.native.records.flatMap((record) => record.tiers);
  assert.equal(result.native.records.length, 3);
  assert.equal(tiers.length, 9);
  assert.equal(result.comparisons.length, 9);
  for (const record of result.native.records) {
    for (const tier of record.tiers) {
      assert.deepEqual(tier.bundle.anatomy, {
        schemaVersion: 'holoscript.agent-avatar-anatomy.v1',
        faceWidth: record.faceWidth,
        faceLength: record.faceLength,
        jawTaper: record.jawTaper,
        shoulderScale: record.shoulderScale,
        torsoScale: record.torsoScale,
      });
      // Re-witnessed under the admitted v2 semantics. The eight fields v2 added are the
      // skin-sss material group's own values, now disclosed by the receipt; they are asserted
      // against that group below so the golden cannot drift away from what actually renders.
      const skinGroup = tier.bundle.materialGroups.find(
        (group) => group.material.shadingModel === 'skin-sss'
      );
      assert.deepEqual(tier.bundle.skin, {
        schemaVersion: 'holoscript.agent-avatar-skin-material.v2',
        calibrationProfile: 'legacy-v1',
        shadingModel: 'skin-sss',
        color: skinGroup.material.color,
        scatterColor: skinGroup.material.scatterColor,
        scatterRadii: skinGroup.material.scatterRadii,
        specularF0: skinGroup.material.specularF0,
        thickness: skinGroup.material.thickness,
        transmitStrength: skinGroup.material.transmitStrength,
        ambient: skinGroup.material.ambient,
        microdetailProfile: 'analytic-pore-v1',
        microdetailScale: record.microdetailScale,
        microdetailStrength: record.microdetailStrength,
        roughness: 0.45,
      });
      // legacy-v1 is the calibration that preserves the pre-H4J appearance. Pin the values it
      // selects, so a change of upstream default calibration cannot pass silently.
      assert.equal(skinGroup.material.thickness, 0.3);
      assert.equal(skinGroup.material.transmitStrength, 0.4);
      assert.equal(skinGroup.material.ambient, 0.12);
      assert.equal(skinGroup.material.roughness, 0.45);
      assert.equal(tier.bundle.groom.crownWhorl, record.crownWhorl);
      assert.deepEqual(tier.bundle.lod.transition, {
        schemaVersion: 'holoscript.character-lod-transition.v1',
        selectionMode: 'distance',
        mode: 'dither',
        durationSeconds: 0.26,
        hysteresisBand: 0.65,
      });
      assert.equal(tier.bundle.report.stubbed.length, 0);
    }
  }
  for (const comparison of result.comparisons) {
    assert.equal(comparison.anatomy.baselineReceiptAbsent, true);
    assert.equal(comparison.anatomy.geometryChanged, true);
    assert.equal(comparison.crown.baseline, 0);
    assert.equal(comparison.crown.geometryChanged, true);
    assert.equal(comparison.skin.baselineReceiptAbsent, true);
    assert.deepEqual(comparison.skin.baselineMaterial, {
      microdetailProfile: 'none',
      microdetailScale: 0,
      microdetailStrength: 0,
    });
    assert.equal(comparison.skin.geometryByteIdentical, true);
    assert.match(comparison.geometrySha256, /^[0-9a-f]{64}$/);
  }
});

test('H3I fails closed on bridge, texture, realism, and temporal claim drift', async () => {
  const stack = await parseH3IStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.externalSkinTextureUsed = true;
  stack.contract.state.externalHairTextureUsed = true;
  stack.contract.state.presentationShaderOverrideUsed = true;
  stack.contract.state.presentationSkinMicrodetailBridgeUsed = false;
  stack.contract.state.presentationWardrobeBridgeUsed = false;
  stack.contract.state.presentationNativeTorsoClipUsed = false;
  stack.contract.state.productionGroomClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  stack.contract.state.biometricLikenessClaimed = true;
  stack.contract.state.motionReprojectionClaimed = true;
  stack.contract.state.nativeWebgpuTaaClaimed = true;
  const validation = validateH3IContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /externalSkinTextureUsed/);
  assert.match(errors, /externalHairTextureUsed/);
  assert.match(errors, /presentationShaderOverrideUsed/);
  assert.match(errors, /presentationSkinMicrodetailBridgeUsed/);
  assert.match(errors, /presentationWardrobeBridgeUsed/);
  assert.match(errors, /presentationNativeTorsoClipUsed/);
  assert.match(errors, /productionGroomClaimed/);
  assert.match(errors, /photorealismClaimed/);
  assert.match(errors, /biometricLikenessClaimed/);
  assert.match(errors, /motionReprojectionClaimed/);
  assert.match(errors, /nativeWebgpuTaaClaimed/);
});
