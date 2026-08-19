import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3CFaceBundles,
  parseH3CStack,
  validateH3CContract,
} from '../check-hololand-model-village-character-appearance-h3c.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ||
  'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3C parses all three formats and binds the source-authored face contract', async () => {
  const stack = await parseH3CStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3CContract(
    stack,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(
    stack.contract.state.faceFoundation.topology,
    'neutral-anatomical-v2',
  );
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2',
  );
  assert.equal(
    stack.contract.state.nativeAdmission.morphSchemaVersion,
    'holoscript.native-facial-morph.v2',
  );
  assert.equal(
    stack.contract.state.nativeAdmission.blinkClosesAuthoredOrbitalLid,
    true,
  );
  assert.equal(
    stack.contract.state.nativeAdmission
      .expressionNormalRecomputationAdmitted,
    false,
  );
  assert.deepEqual(
    validation.plan.expressions.map(
      (expression) => expression.expressionId,
    ),
    ['neutral', 'soft_smile', 'viseme_oh', 'blink_closed'],
  );
  assert.deepEqual(
    validation.plan.personas.map(
      (persona) => persona.nativeHairStyleId,
    ),
    ['cropped_coils', 'short', 'medium_wavy'],
  );
});

test('H3C emits nine deterministic native bundles with a real topology delta', async () => {
  const stack = await parseH3CStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3CContract(
    stack,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const face = await compileH3CFaceBundles(
    stack,
    validation.plan,
  );
  const tiers = face.native.records.flatMap((record) => record.tiers);
  assert.equal(face.native.records.length, 3);
  assert.equal(tiers.length, 9);
  assert.ok(face.topologyVertexDelta >= 250);
  for (const tier of tiers) {
    assert.equal(
      tier.bundle.face.topology,
      'neutral-anatomical-v2',
    );
    assert.equal(tier.bundle.face.radialSegments, 22);
    assert.equal(tier.bundle.face.verticalSegments, 16);
    assert.equal(tier.bundle.face.tearline, true);
    assert.equal(
      tier.bundle.morph.topology,
      'neutral-anatomical-v2',
    );
    assert.equal(
      tier.bundle.morph.schemaVersion,
      'holoscript.native-facial-morph.v2',
    );
    assert.equal(tier.bundle.morph.normalsRecomputed, false);
    assert.deepEqual(tier.bundle.report.stubbed, []);
  }
  assert.equal(face.native.expressionBundles.length, 4);
  for (const expression of face.native.expressionBundles) {
    assert.equal(
      expression.morph.topology,
      'neutral-anatomical-v2',
    );
    assert.equal(
      expression.morph.schemaVersion,
      'holoscript.native-facial-morph.v2',
    );
    assert.equal(expression.morph.normalsRecomputed, false);
  }
  const blink = face.native.expressionBundles.find(
    (expression) => expression.expressionId === 'blink_closed',
  );
  assert.ok(blink, 'blink_closed probe missing');
  assert.ok(
    blink.morph.changedVertexCount > 0,
    'authored blink deformed nothing',
  );
});

test('H3C witnesses the v2 blink closing the whole authored orbital lid', async () => {
  const stack = await parseH3CStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3CContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const face = await compileH3CFaceBundles(stack, validation.plan);
  const lid = face.orbitalLidBlink;
  assert.equal(
    lid.unrimmedSchemaVersion,
    'holoscript.native-facial-morph.v1',
    'withholding the authored tearline must fall back to the v1 eye-globe blink',
  );
  assert.equal(
    lid.rimmedSchemaVersion,
    'holoscript.native-facial-morph.v2',
  );
  assert.ok(lid.authoredRimVertexCount > 0);
  assert.equal(
    lid.blinkChangedVertexDelta,
    lid.authoredRimVertexCount,
    'v2 blink must move every vertex the authored rim contributed',
  );
  assert.ok(
    lid.rimmedChangedVertexCount > lid.unrimmedChangedVertexCount,
    'v2 blink must deform strictly more than the v1 eye-globe blink',
  );
});

test('H3C fails closed if the admitted morph schema drifts', async () => {
  const stack = await parseH3CStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.nativeAdmission.morphSchemaVersion =
    'holoscript.native-facial-morph.v3';
  stack.contract.state.nativeAdmission.expressionNormalRecomputationAdmitted =
    true;
  const validation = validateH3CContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  assert.match(
    validation.errors.join('\n'),
    /admitted native facial morph semantics drifted/,
  );
});

test('H3C fails closed on production, photoreal, and biometric overclaims', async () => {
  const stack = await parseH3CStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.productionFaceCompleteClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  stack.contract.state.biometricPersistenceAllowed = true;
  const validation = validateH3CContract(
    stack,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /productionFaceCompleteClaimed/);
  assert.match(errors, /photorealismClaimed/);
  assert.match(errors, /biometricPersistenceAllowed/);
});
