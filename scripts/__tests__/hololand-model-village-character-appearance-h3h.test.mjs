import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3HTemporalLodBundles,
  parseH3HStack,
  validateH3HContract,
} from '../check-hololand-model-village-character-appearance-h3h.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3H parses all three formats and binds the temporal LOD truth boundary', async () => {
  const stack = await parseH3HStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3HContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(stack.contract.state.hairResponseFoundation.coverageProfile, 'alpha-to-coverage-v1');
  assert.equal(
    stack.contract.state.hairResponseFoundation.hairMaterialReceiptSchema,
    'holoscript.agent-avatar-hair-material.v2'
  );
  assert.equal(stack.contract.state.hairResponseFoundation.sourceColorAuthored, true);
  assert.equal(
    stack.contract.state.nativeAdmission.hairMaterialReceiptSchemaRequired,
    'holoscript.agent-avatar-hair-material.v2'
  );
  assert.equal(stack.contract.state.nativeAdmission.sourceColorWeightTierInvariantRequired, true);
  assert.deepEqual(stack.contract.state.temporalLodFoundation, {
    selectionMode: 'distance',
    transitionMode: 'dither',
    durationMilliseconds: 260,
    hysteresisBand: 0.65,
    sharedRendererCount: 1,
    sharedSceneCount: 1,
    temporalComposerCount: 1,
    temporalBridge: 'three-taarenderpass-v1',
    temporalSampleLevel: 0,
    accumulationFrames: 32,
    internalRenderWidth: 1360,
    internalRenderHeight: 448,
    presentationWidth: 1680,
    presentationHeight: 554,
    internalRenderScale: 0.81,
    historyPolicy: 'invalidate-on-motion-or-lod-change-v1',
    motionVectorsAvailable: false,
    motionReprojection: false,
    nativeWebgpuTaa: false,
    sourceAuthoredTransitionReceiptRequired: true,
    presentationBridge: true,
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
      ({ strandCoverage, edgeSoftness, anisotropyStrength, longitudinalShift }) => [
        strandCoverage,
        edgeSoftness,
        anisotropyStrength,
        longitudinalShift,
      ]
    ),
    [
      [0.84, 0.12, 0.86, 0.08],
      [0.8, 0.14, 0.9, 0.12],
      [0.86, 0.1, 0.84, 0.06],
    ]
  );
  // Three distinct authored weights: a checker that silently accepted the upstream 0.55
  // default cannot pass this.
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.sourceColorWeight),
    [0.55, 0.62, 0.48]
  );
});

test('H3H emits nine deterministic native LOD transition receipts', async () => {
  const stack = await parseH3HStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3HContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const hairResponse = await compileH3HTemporalLodBundles(stack, validation.plan);
  const tiers = hairResponse.native.records.flatMap((record) => record.tiers);
  assert.equal(hairResponse.native.records.length, 3);
  assert.equal(tiers.length, 9);
  assert.equal(hairResponse.comparisons.length, 9);
  assert.equal(hairResponse.sourceColorTiers.length, 3);
  for (const entry of hairResponse.sourceColorTiers) {
    assert.deepEqual(entry.levels, [0, 1, 2]);
    assert.equal(entry.tierInvariant, true);
    assert.deepEqual(entry.tierWeights, [
      entry.authoredSourceColorWeight,
      entry.authoredSourceColorWeight,
      entry.authoredSourceColorWeight,
    ]);
    assert.deepEqual(entry.tierSchemas, [
      'holoscript.agent-avatar-hair-material.v2',
      'holoscript.agent-avatar-hair-material.v2',
      'holoscript.agent-avatar-hair-material.v2',
    ]);
  }
  assert.deepEqual(
    hairResponse.sourceColorTiers.map((entry) => entry.authoredSourceColorWeight),
    [0.55, 0.62, 0.48]
  );
  for (const tier of tiers) {
    assert.equal(tier.bundle.groom.profile, 'scalp-flow-v1');
    assert.equal(
      tier.bundle.groom.material.schemaVersion,
      'holoscript.agent-avatar-hair-material.v2'
    );
    assert.equal(tier.bundle.groom.scalpSurface, 'neutral-anatomical-ellipsoid');
    assert.equal(tier.bundle.groom.schemaVersion, 'holoscript.agent-avatar-groom-geometry.v1');
    assert.equal(tier.bundle.groom.material.coverageProfile, 'alpha-to-coverage-v1');
    assert.equal(tier.bundle.groom.material.alphaToCoverageRequested, true);
    assert.equal(tier.bundle.groom.material.tangentAttribute, 'strand-flow');
    assert.equal(tier.bundle.groom.material.cardUvAttribute, 'card-width');
    assert.deepEqual(tier.bundle.lod.transition, {
      schemaVersion: 'holoscript.character-lod-transition.v1',
      selectionMode: 'distance',
      mode: 'dither',
      durationSeconds: 0.26,
      hysteresisBand: 0.65,
    });
    assert.deepEqual(tier.lodTransition, tier.bundle.lod.transition);
    assert.equal(tier.cardUv.min, 0);
    assert.equal(tier.cardUv.max, 1);
    assert.ok(tier.cardUv.vertexCount > 0);
    assert.equal(tier.ocularGroupCount, 8);
    assert.equal(
      tier.bundle.report.mapped.some((entry) =>
        entry.startsWith('@hair(groom_profile=scalp-flow-v1')
      ),
      true
    );
    assert.equal(
      tier.bundle.report.mapped.some((entry) =>
        entry.startsWith('@hair(coverage_profile=alpha-to-coverage-v1')
      ),
      true
    );
    assert.equal(
      tier.bundle.report.mapped.includes(
        '@lod(transition=dither,duration_s=0.26,hysteresis=0.65,selection=distance)'
      ),
      true
    );
  }
  for (const comparison of hairResponse.comparisons) {
    assert.equal(comparison.sourceAuthored.coverageProfile, 'alpha-to-coverage-v1');
    assert.equal(comparison.opaque.coverageProfile, 'opaque-v1');
    // Colour authorship is independent of the coverage profile.
    assert.equal(comparison.opaque.sourceColorWeight, comparison.sourceAuthored.sourceColorWeight);
    assert.equal(comparison.opaque.sourceColor, comparison.sourceAuthored.sourceColor);
    assert.equal(comparison.geometryByteIdentical, true);
    assert.match(comparison.geometrySha256, /^[0-9a-f]{64}$/);
  }
});

test('H3H fails closed on bridge, realism, and temporal-claim drift', async () => {
  const stack = await parseH3HStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.externalHairTextureUsed = true;
  stack.contract.state.presentationShaderOverrideUsed = true;
  stack.contract.state.presentationAlphaMapUsed = false;
  stack.contract.state.strandHairClaimed = true;
  stack.contract.state.scanDerivedGroomClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  stack.contract.state.motionReprojectionClaimed = true;
  stack.contract.state.nativeWebgpuTaaClaimed = true;
  stack.contract.state.nativeHairSourceColorWeightClaimed = false;
  const validation = validateH3HContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /externalHairTextureUsed/);
  assert.match(errors, /presentationShaderOverrideUsed/);
  assert.match(errors, /presentationAlphaMapUsed/);
  assert.match(errors, /strandHairClaimed/);
  assert.match(errors, /scanDerivedGroomClaimed/);
  assert.match(errors, /photorealismClaimed/);
  assert.match(errors, /motionReprojectionClaimed/);
  assert.match(errors, /nativeWebgpuTaaClaimed/);
  assert.match(errors, /nativeHairSourceColorWeightClaimed/);
});
