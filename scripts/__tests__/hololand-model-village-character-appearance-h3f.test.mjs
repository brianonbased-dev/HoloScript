import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3FGroomBundles,
  parseH3FStack,
  validateH3FContract,
} from '../check-hololand-model-village-character-appearance-h3f.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3F parses all three formats and binds source-authored scalp-flow controls', async () => {
  const stack = await parseH3FStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3FContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(stack.contract.state.groomFoundation.profile, 'scalp-flow-v1');
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
  );
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.personaId),
    ['hearth_keeper', 'path_tender', 'record_steward']
  );
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.hairColorInt),
    [0x2d201c, 0x161a20, 0x5a3828]
  );
  assert.equal(stack.contract.state.groomMaterialFoundation.coverageProfile, 'opaque-v1');
  assert.equal(
    stack.contract.state.groomMaterialFoundation.sourceColorWeightAuthoredHere,
    false
  );
  assert.deepEqual(
    validation.plan.personas.map(({ cardWidth, rootLift, tipTaper, hairlineBias }) => [
      cardWidth,
      rootLift,
      tipTaper,
      hairlineBias,
    ]),
    [
      [0.0052, 0.0025, 0.08, 0.17],
      [0.0058, 0.002, 0.14, 0.18],
      [0.0052, 0.0025, 0.08, 0.15],
    ]
  );
});

test('H3F emits nine deterministic groom receipts that beat the legacy radial baseline', async () => {
  const stack = await parseH3FStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3FContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const groom = await compileH3FGroomBundles(stack, validation.plan);
  const tiers = groom.native.records.flatMap((record) => record.tiers);
  assert.equal(groom.native.records.length, 3);
  assert.equal(tiers.length, 9);
  assert.equal(groom.comparisons.length, 9);
  for (const tier of tiers) {
    assert.equal(tier.bundle.groom.profile, 'scalp-flow-v1');
    assert.equal(tier.bundle.groom.scalpSurface, 'neutral-anatomical-ellipsoid');
    assert.equal(tier.bundle.groom.schemaVersion, 'holoscript.agent-avatar-groom-geometry.v1');
    assert.ok(tier.bundle.groom.rootTangentRadialDotP95 <= 0.01);
    assert.equal(tier.ocularGroupCount, 8);
    assert.equal(
      tier.bundle.report.mapped.some((entry) =>
        entry.startsWith('@hair(groom_profile=scalp-flow-v1')
      ),
      true
    );
    // H3F is the opaque, pre-coverage groom gate. Upstream now emits the
    // coverage and chroma-weight decision on the derived receipt, so witness
    // it instead of restating the source's own booleans.
    assert.equal(
      tier.bundle.groom.material.schemaVersion,
      'holoscript.agent-avatar-hair-material.v2'
    );
    assert.equal(tier.bundle.groom.material.coverageProfile, 'opaque-v1');
    assert.equal(tier.bundle.groom.material.strandCoverage, 1);
    assert.equal(tier.bundle.groom.material.alphaToCoverageRequested, false);
    // The authored @hair(color) reaches the material at the UNAUTHORED upstream
    // weight. H3F must not author that weight: @hair(source_color_weight) is
    // H3G's control, and authoring it here would erase the H3F -> H3G delta.
    assert.equal(tier.bundle.groom.material.sourceColorWeight, 0.55);
    assert.equal(
      tier.bundle.report.mapped.some((entry) =>
        entry.startsWith('@hair(source_color_weight')
      ),
      false
    );
  }
  // Each persona's own authored hair colour, not merely 'some colour'.
  assert.deepEqual(
    groom.native.records.map((record) => [
      record.personaId,
      record.tiers.map((tier) => tier.bundle.groom.material.sourceColor),
    ]),
    [
      ['hearth_keeper', [0x2d201c, 0x2d201c, 0x2d201c]],
      ['path_tender', [0x161a20, 0x161a20, 0x161a20]],
      ['record_steward', [0x5a3828, 0x5a3828, 0x5a3828]],
    ]
  );
  for (const comparison of groom.comparisons) {
    assert.equal(comparison.legacyRadial.profile, 'radial-cards-v1');
    assert.ok(
      comparison.scalpFlow.rootTangentRadialDotP95 < comparison.legacyRadial.rootTangentRadialDotP95
    );
    assert.ok(
      comparison.scalpFlow.frontalOcclusionVertexCount <
        comparison.legacyRadial.frontalOcclusionVertexCount
    );
  }
});

test('H3F fails closed when upstream stops honouring the opaque groom material', async () => {
  const stack = await parseH3FStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3FContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const groom = await compileH3FGroomBundles(stack, validation.plan);
  const sample = groom.native.records[0].tiers[0].bundle.groom.material;
  // The boundary is read off the compiled receipt, so a coverage or
  // chroma-weight change upstream is observable here rather than silently
  // absorbed. These are the exact fields the checker rejects on.
  assert.notEqual(sample.coverageProfile, 'alpha-to-coverage-v1');
  assert.ok(sample.strandCoverage === 1 && sample.alphaToCoverageRequested === false);
  assert.equal(sample.sourceColor, 0x2d201c);
});

test('H3F fails closed on alpha, strand, scan, and realism overclaims', async () => {
  const stack = await parseH3FStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.hairAlphaMaskUsed = true;
  stack.contract.state.strandHairClaimed = true;
  stack.contract.state.scanDerivedGroomClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  const validation = validateH3FContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /hairAlphaMaskUsed/);
  assert.match(errors, /strandHairClaimed/);
  assert.match(errors, /scanDerivedGroomClaimed/);
  assert.match(errors, /photorealismClaimed/);
});
