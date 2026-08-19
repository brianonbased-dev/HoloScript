import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3JCivicBundles,
  parseH3JStack,
  validateH3JContract,
} from '../check-hololand-model-village-character-appearance-h3j.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3J parses all three formats and binds the native civic landmark boundary', async () => {
  const stack = await parseH3JStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3JContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.deepEqual(stack.contract.state.civicLandmarkFoundation, {
    garmentStyle: 'stormglass-open-civic-tunic',
    garmentReceiptSchema: 'holoscript.agent-avatar-garment-geometry.v1',
    faceProfile: 'civic-landmarks-v1',
    faceReceiptSchema: 'holoscript.agent-avatar-facial-landmarks.v1',
    groomProfile: 'scalp-flow-v1',
    groomReceiptSchema: 'holoscript.agent-avatar-groom-geometry.v1',
    eyeScaleRange: [0.8, 0.84],
    browHeightRange: [1.16, 1.3],
    browThicknessRange: [0.17, 0.2],
    earScaleRange: [1, 1.08],
    mouthDepthRange: [0.76, 0.94],
    clusterCountRange: [12, 16],
    clusterSpreadRange: [0.36, 0.48],
    hairSourceColorWeightRange: [0.44, 0.68],
    openFaceRequired: true,
    nativeWardrobeRequired: true,
    presentationWardrobeBridge: false,
    nativeTorsoClip: false,
  });
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
  );
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.personaId),
    ['hearth_keeper', 'path_tender', 'record_steward']
  );
  assert.deepEqual(stack.contract.state.lodTransitionFoundation, {
    receiptSchema: 'holoscript.character-lod-transition.v1',
    selectionMode: 'distance',
    fadeMode: 'dither',
    fadeDurationSeconds: 0.26,
    fadeDurationMilliseconds: 260,
    hysteresisBand: 0.65,
  });
  // Three distinct authored chroma weights, none of them upstream's 0.55 default. If any equalled
  // the default, the round-trip assertion in the next test could pass while upstream silently
  // discarded the authored key.
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.hairSourceColorWeight),
    [0.62, 0.44, 0.68]
  );
  assert.deepEqual(
    validation.plan.personas.map(
      ({
        eyeScale,
        browHeight,
        browThickness,
        earScale,
        mouthDepth,
        clusterCount,
        clusterSpread,
      }) => [eyeScale, browHeight, browThickness, earScale, mouthDepth, clusterCount, clusterSpread]
    ),
    [
      [0.82, 1.24, 0.18, 1.04, 0.88, 14, 0.42],
      [0.84, 1.16, 0.17, 1, 0.76, 12, 0.36],
      [0.8, 1.3, 0.2, 1.08, 0.94, 16, 0.48],
    ]
  );
});

test('H3J emits three exact native receipts with stripped-control causal deltas', async () => {
  const stack = await parseH3JStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3JContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const result = await compileH3JCivicBundles(stack, validation.plan);
  assert.equal(result.records.length, 3);
  for (const record of result.records) {
    assert.deepEqual(
      {
        schemaVersion: record.bundle.facialLandmarks.schemaVersion,
        profile: record.bundle.facialLandmarks.profile,
        eyeScale: record.bundle.facialLandmarks.eyeScale,
        browHeight: record.bundle.facialLandmarks.browHeight,
        browThickness: record.bundle.facialLandmarks.browThickness,
        earScale: record.bundle.facialLandmarks.earScale,
        mouthDepth: record.bundle.facialLandmarks.mouthDepth,
      },
      {
        schemaVersion: 'holoscript.agent-avatar-facial-landmarks.v1',
        profile: 'civic-landmarks-v1',
        eyeScale: record.eyeScale,
        browHeight: record.browHeight,
        browThickness: record.browThickness,
        earScale: record.earScale,
        mouthDepth: record.mouthDepth,
      }
    );
    assert.deepEqual(
      {
        schemaVersion: record.bundle.garment.schemaVersion,
        style: record.bundle.garment.style,
        faceCoverage: record.bundle.garment.faceCoverage,
        visorVertexCount: record.bundle.garment.visorVertexCount,
        visorTriangleCount: record.bundle.garment.visorTriangleCount,
      },
      {
        schemaVersion: 'holoscript.agent-avatar-garment-geometry.v1',
        style: 'stormglass_open_civic_tunic',
        faceCoverage: 'open-v-collar',
        visorVertexCount: 0,
        visorTriangleCount: 0,
      }
    );
    assert.equal(record.bundle.groom.clusterCount, record.clusterCount);
    assert.equal(record.bundle.groom.clusterSpread, record.clusterSpread);
    assert.equal(
      record.bundle.groom.material.schemaVersion,
      'holoscript.agent-avatar-hair-material.v2'
    );
    assert.equal(record.bundle.groom.material.sourceColorWeight, record.hairSourceColorWeight);
    assert.notEqual(record.bundle.groom.material.sourceColorWeight, 0.55);
    assert.ok(
      record.bundle.report.mapped.includes(
        `@hair(source_color_weight=${record.hairSourceColorWeight})`
      ),
      `${record.personaId} authored hair chroma weight was not mapped by the compiler`
    );
    assert.deepEqual(record.bundle.lod.transition, {
      schemaVersion: 'holoscript.character-lod-transition.v1',
      selectionMode: 'distance',
      mode: 'dither',
      durationSeconds: 0.26,
      hysteresisBand: 0.65,
    });
    assert.equal(record.bundle.report.stubbed.length, 0);
    assert.equal(record.comparisons.facialLandmarks.baselineReceiptAbsent, true);
    assert.equal(record.comparisons.facialLandmarks.geometryChanged, true);
    assert.ok(record.comparisons.facialLandmarks.vertexDelta > 0);
    assert.equal(record.comparisons.groomClusters.baselineReceiptClusterAbsent, true);
    assert.equal(record.comparisons.groomClusters.geometryChanged, true);
    assert.ok(Number.isInteger(record.comparisons.groomClusters.vertexDelta));
    assert.equal(record.comparisons.openGarment.baselineReceiptAbsent, true);
    assert.equal(record.comparisons.openGarment.geometryChanged, true);
    assert.ok(record.comparisons.openGarment.vertexDelta > 0);
    assert.match(record.geometrySha256, /^[0-9a-f]{64}$/);
    assert.match(record.repeatedCompileSha256, /^[0-9a-f]{64}$/);
  }
});

test('H3J fails closed on unauthored hair chroma and lod transition drift', async () => {
  const stack = await parseH3JStack(ROOT, HOLOSCRIPT_ROOT);
  const clean = validateH3JContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(clean.status, 'pass', clean.errors.join('\n'));
  stack.contract.objects[0].hairSourceColorWeight = 0.55;
  stack.contract.state.lodTransitionFoundation.fadeMode = 'crossfade';
  const drifted = validateH3JContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(drifted.status, 'fail');
  const driftErrors = drifted.errors.join('\n');
  assert.match(driftErrors, /hearth_keeper source-authored hair chroma weight drifted/);
  assert.match(driftErrors, /lod transition foundation drifted/);
  assert.match(driftErrors, /hearth_keeper source-authored lod transition drifted/);
});

test('H3J fails closed on wardrobe bridge, realism, and temporal claim drift', async () => {
  const stack = await parseH3JStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.presentationWardrobeBridgeUsed = true;
  stack.contract.state.presentationNativeTorsoClipUsed = true;
  stack.contract.state.externalSkinTextureUsed = true;
  stack.contract.state.externalHairTextureUsed = true;
  stack.contract.state.externalWardrobeTextureUsed = true;
  stack.contract.state.productionGroomClaimed = true;
  stack.contract.state.productionSkinTexturingClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  stack.contract.state.biometricLikenessClaimed = true;
  stack.contract.state.motionReprojectionClaimed = true;
  stack.contract.state.nativeWebgpuTaaClaimed = true;
  stack.contract.state.questWebxrMeasured = true;
  const validation = validateH3JContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /presentationWardrobeBridgeUsed/);
  assert.match(errors, /presentationNativeTorsoClipUsed/);
  assert.match(errors, /externalSkinTextureUsed/);
  assert.match(errors, /externalHairTextureUsed/);
  assert.match(errors, /externalWardrobeTextureUsed/);
  assert.match(errors, /productionGroomClaimed/);
  assert.match(errors, /productionSkinTexturingClaimed/);
  assert.match(errors, /photorealismClaimed/);
  assert.match(errors, /biometricLikenessClaimed/);
  assert.match(errors, /motionReprojectionClaimed/);
  assert.match(errors, /nativeWebgpuTaaClaimed/);
  assert.match(errors, /questWebxrMeasured/);
});
