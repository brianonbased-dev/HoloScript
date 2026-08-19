import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3DOcularBundles,
  parseH3DStack,
  validateH3DContract,
} from '../check-hololand-model-village-character-appearance-h3d.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3D parses all three formats and binds the source-authored ocular contract', async () => {
  const stack = await parseH3DStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3DContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(stack.contract.state.ocularFoundation.profile, 'layered-ocular-v1');
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
  );
  assert.equal(
    stack.contract.state.nativeAdmission.morphSchemaVersion,
    'holoscript.native-facial-morph.v2'
  );
  assert.equal(
    stack.contract.state.nativeAdmission.morphSchemaVersionRefused,
    'holoscript.native-facial-morph.v3'
  );
  assert.equal(stack.contract.state.nativeAdmission.crossEyeOcularClosureAllowed, false);
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.personaId),
    ['hearth_keeper', 'path_tender', 'record_steward']
  );
  assert.deepEqual(
    validation.plan.personas.map((persona) => persona.irisColor),
    ['#6B8C82', '#A58B52', '#526D91']
  );
});

test('H3D emits nine deterministic bundles with eight native ocular groups each', async () => {
  const stack = await parseH3DStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3DContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const ocular = await compileH3DOcularBundles(stack, validation.plan);
  const tiers = ocular.native.records.flatMap((record) => record.tiers);
  assert.equal(ocular.native.records.length, 3);
  assert.equal(tiers.length, 9);
  assert.ok(ocular.ocularVertexDelta >= 400);
  assert.ok(ocular.ocularTriangleDelta >= 400);
  for (const tier of tiers) {
    assert.equal(tier.bundle.face.ocularProfile, 'layered-ocular-v1');
    assert.equal(tier.ocularGroupCount, 8);
    assert.deepEqual(tier.ocularRegions, {
      sclera: 2,
      iris: 2,
      pupil: 2,
      cornea: 2,
    });
    const eyeGroups = tier.bundle.materialGroups.filter(
      (group) => group.material.shadingModel === 'refractive-eye'
    );
    assert.equal(
      eyeGroups.some((group) => !group.material.eyeRegion),
      false
    );
    assert.equal(
      eyeGroups
        .filter((group) => group.material.eyeRegion === 'cornea')
        .every((group) => group.transparent === true),
      true
    );
  }
});

test('H3D re-witnesses the admitted v2 orbital lid closing each eye of its own ocular stack', async () => {
  const stack = await parseH3DStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3DContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const ocular = await compileH3DOcularBundles(stack, validation.plan);
  const closure = ocular.orbitalLidClosure;
  assert.equal(ocular.morphSchemaVersion, 'holoscript.native-facial-morph.v2');
  // The v2 admission has to be earned by this composition's own authored tearline.
  assert.equal(closure.unrimmedSchemaVersion, 'holoscript.native-facial-morph.v1');
  assert.ok(closure.authoredRimVertexCount > 0);
  assert.equal(closure.blinkChangedVertexDelta, closure.authoredRimVertexCount);
  // Each lid closes something, and the two lids never touch the same vertex.
  assert.ok(closure.movedByLeftLid > 0);
  assert.equal(closure.movedByLeftLid, closure.movedByRightLid);
  for (const side of ['left', 'right']) {
    for (const region of ['sclera', 'iris', 'pupil', 'cornea']) {
      const measured = closure.regionClosure[`${side}.${region}`];
      assert.ok(measured, `${side}.${region} was not measured`);
      assert.ok(
        measured.closedByOwnLid > 0,
        `${side} ${region} did not move under its own lid`
      );
      assert.equal(
        measured.closedByOtherLid,
        0,
        `${side} ${region} moved under the other eye's lid`
      );
    }
  }
});

test('H3D fails closed on presentation shaders, tear film, and photoreal overclaims', async () => {
  const stack = await parseH3DStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.presentationShaderOverrideUsed = true;
  stack.contract.state.productionTearFilmClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  const validation = validateH3DContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /presentationShaderOverrideUsed/);
  assert.match(errors, /productionTearFilmClaimed/);
  assert.match(errors, /photorealismClaimed/);
});

test('H3D refuses a source that quietly widens the admitted morph semantics', async () => {
  for (const mutate of [
    (state) => {
      state.nativeAdmission.morphSchemaVersion = 'holoscript.native-facial-morph.v3';
    },
    (state) => {
      state.nativeAdmission.crossEyeOcularClosureAllowed = true;
    },
    (state) => {
      state.nativeAdmission.expressionNormalRecomputationAdmitted = true;
    },
  ]) {
    const stack = await parseH3DStack(ROOT, HOLOSCRIPT_ROOT);
    mutate(stack.contract.state);
    const validation = validateH3DContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.equal(validation.status, 'fail');
    assert.match(validation.errors.join('\n'), /admitted native facial morph semantics drifted/);
  }
});
