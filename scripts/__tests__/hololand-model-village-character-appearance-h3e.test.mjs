import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3EOrbitalBundles,
  parseH3EStack,
  proveAuthoredOrbitalParametersOperative,
  validateH3EContract,
  witnessH3EOrbitalGeometry,
} from '../check-hololand-model-village-character-appearance-h3e.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3E parses all three formats and binds source-authored orbital fit', async () => {
  const stack = await parseH3EStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3EContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(stack.contract.state.orbitalFoundation.profile, 'recessed-lids-v1');
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
  );
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.personaId),
    ['hearth_keeper', 'path_tender', 'record_steward']
  );
  assert.deepEqual(
    validation.plan.personas.map(({ eyeRecess, lidOpening, canthalTilt }) => [
      eyeRecess,
      lidOpening,
      canthalTilt,
    ]),
    [
      [0.3, 0.46, 0.14],
      [0.27, 0.49, 0.1],
      [0.32, 0.44, 0.16],
    ]
  );
});

test('H3E emits nine deterministic fitted bundles over the legacy tearline profile', async () => {
  const stack = await parseH3EStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3EContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const orbital = await compileH3EOrbitalBundles(stack, validation.plan);
  const tiers = orbital.native.records.flatMap((record) => record.tiers);
  assert.equal(orbital.native.records.length, 3);
  assert.equal(tiers.length, 9);
  assert.equal(orbital.orbitalVertexDelta, 76);
  assert.equal(orbital.orbitalTriangleDelta, 76);
  for (const tier of tiers) {
    assert.equal(tier.bundle.face.orbitalProfile, 'recessed-lids-v1');
    assert.equal(tier.orbitalProfile, 'recessed-lids-v1');
    assert.equal(tier.ocularGroupCount, 8);
    assert.deepEqual(tier.ocularRegions, {
      sclera: 2,
      iris: 2,
      pupil: 2,
      cornea: 2,
    });
    assert.equal(
      tier.bundle.report.mapped.includes('@face(orbital_profile=recessed-lids-v1)'),
      true
    );
  }
});

test('H3E witnesses the native orbital construction, not just its echo', async () => {
  const stack = await parseH3EStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3EContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const geometry = await witnessH3EOrbitalGeometry(stack, validation.plan, HOLOSCRIPT_ROOT);
  assert.deepEqual(geometry.catalog, [
    'tearline-rim-v1',
    'recessed-lids-v1',
    'anatomical-lid-fold-v2',
    'anatomical-lid-blend-v3',
    'integrated-lid-rim-v4',
  ]);
  assert.equal(geometry.receipts.length, 9);
  assert.equal(geometry.legacyComparisonProfile, 'tearline-rim-v1');
  assert.equal(geometry.legacyDedicatedVertexCount, 76);
  assert.equal(geometry.legacyDedicatedIndexCount, 204);
  assert.equal(geometry.derivedVertexDelta, 76);
  assert.equal(geometry.derivedTriangleDelta, 76);
  for (const receipt of geometry.receipts) {
    assert.equal(receipt.profile, 'recessed-lids-v1');
    assert.equal(receipt.dedicatedVertexCount, 152);
    assert.equal(receipt.dedicatedIndexCount, 432);
  }
});

test('H3E proves each authored orbital parameter moves geometry', async () => {
  const stack = await parseH3EStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3EContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const geometry = await witnessH3EOrbitalGeometry(stack, validation.plan, HOLOSCRIPT_ROOT);
  const proofs = await proveAuthoredOrbitalParametersOperative(
    stack,
    validation.plan,
    geometry.receipts[0]
  );
  assert.deepEqual(
    proofs.map((proof) => proof.parameter),
    ['eye_recess', 'lid_opening', 'canthal_tilt']
  );
  for (const proof of proofs) {
    assert.equal(proof.orbitalPositionsMoved, true);
    assert.equal(proof.orbitalVertexRange.vertexCount, 152);
    assert.notEqual(proof.authored, proof.perturbed);
  }
});

test('H3E fails closed when a newer lid profile is admitted without naming it', async () => {
  const stack = await parseH3EStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.orbitalFoundation.admittedOrbitalProfileCatalog = [
    'tearline-rim-v1',
    'recessed-lids-v1',
  ];
  const validation = validateH3EContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  assert.match(validation.errors.join('\n'), /admitted orbital profile catalog drifted/);
});

test('H3E fails closed when the orbital receipt witness is switched off', async () => {
  const stack = await parseH3EStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.nativeAdmission.orbitalGeometryReceiptWitnessRequired = false;
  const validation = validateH3EContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  assert.match(validation.errors.join('\n'), /native orbital admission drifted/);
});

test('H3E fails closed on texture-mask and realism overclaims', async () => {
  const stack = await parseH3EStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.eyelidTextureMaskUsed = true;
  stack.contract.state.anatomicalEyeAccuracyClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  const validation = validateH3EContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /eyelidTextureMaskUsed/);
  assert.match(errors, /anatomicalEyeAccuracyClaimed/);
  assert.match(errors, /photorealismClaimed/);
});
