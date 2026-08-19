import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3GHairResponseBundles,
  parseH3GStack,
  validateH3GContract,
} from '../check-hololand-model-village-character-appearance-h3g.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3G parses all three formats and binds source-authored hair response controls', async () => {
  const stack = await parseH3GStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3GContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(stack.contract.state.hairResponseFoundation.coverageProfile, 'alpha-to-coverage-v1');
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
  // Every persona authors its own hair-chroma weight, and none of them may equal
  // the weight upstream applies when a source authors nothing.
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.sourceColorWeight),
    [0.62, 0.5, 0.7]
  );
  for (const persona of validation.plan.personas) {
    assert.notEqual(persona.sourceColorWeight, 0.55);
  }
});

test('H3G emits nine deterministic material receipts over byte-identical opaque geometry', async () => {
  const stack = await parseH3GStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3GContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const hairResponse = await compileH3GHairResponseBundles(stack, validation.plan);
  const tiers = hairResponse.native.records.flatMap((record) => record.tiers);
  assert.equal(hairResponse.native.records.length, 3);
  assert.equal(tiers.length, 9);
  assert.equal(hairResponse.comparisons.length, 9);
  for (const tier of tiers) {
    assert.equal(tier.bundle.groom.profile, 'scalp-flow-v1');
    assert.equal(tier.bundle.groom.scalpSurface, 'neutral-anatomical-ellipsoid');
    assert.equal(tier.bundle.groom.schemaVersion, 'holoscript.agent-avatar-groom-geometry.v1');
    assert.equal(
      tier.bundle.groom.material.schemaVersion,
      'holoscript.agent-avatar-hair-material.v2'
    );
    assert.equal(tier.bundle.groom.material.coverageProfile, 'alpha-to-coverage-v1');
    assert.equal(tier.bundle.groom.material.alphaToCoverageRequested, true);
    assert.equal(tier.bundle.groom.material.tangentAttribute, 'strand-flow');
    assert.equal(tier.bundle.groom.material.cardUvAttribute, 'card-width');
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
  }
  for (const record of hairResponse.native.records) {
    for (const tier of record.tiers) {
      assert.equal(tier.bundle.groom.material.sourceColorWeight, record.sourceColorWeight);
      assert.equal(tier.bundle.groom.material.sourceColor, record.sourceColorInt);
      assert.equal(
        tier.bundle.report.mapped.includes(
          `@hair(source_color_weight=${record.sourceColorWeight})`
        ),
        true
      );
    }
  }
  for (const comparison of hairResponse.comparisons) {
    assert.equal(comparison.sourceAuthored.coverageProfile, 'alpha-to-coverage-v1');
    // The chroma weight is a colour decision, not a coverage decision.
    assert.equal(comparison.opaque.sourceColorWeight, comparison.sourceAuthored.sourceColorWeight);
    assert.equal(comparison.opaque.coverageProfile, 'opaque-v1');
    assert.equal(comparison.geometryByteIdentical, true);
    assert.match(comparison.geometrySha256, /^[0-9a-f]{64}$/);
  }
});

test('H3G fails closed on external texture, custom shader, strand, scan, and realism drift', async () => {
  const stack = await parseH3GStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.externalHairTextureUsed = true;
  stack.contract.state.presentationShaderOverrideUsed = true;
  stack.contract.state.presentationAlphaMapUsed = false;
  stack.contract.state.strandHairClaimed = true;
  stack.contract.state.scanDerivedGroomClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  stack.contract.state.unauthoredChromaBlendClaimed = true;
  const validation = validateH3GContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /unauthoredChromaBlendClaimed/);
  assert.match(errors, /externalHairTextureUsed/);
  assert.match(errors, /presentationShaderOverrideUsed/);
  assert.match(errors, /presentationAlphaMapUsed/);
  assert.match(errors, /strandHairClaimed/);
  assert.match(errors, /scanDerivedGroomClaimed/);
  assert.match(errors, /photorealismClaimed/);
});
