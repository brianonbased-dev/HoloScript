import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  buildH3BPlan,
  compileH3BNativeBundles,
  parseH3BStack,
  validateH3BContract,
} from '../check-hololand-model-village-character-appearance-h3b.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3B parses all three formats and admits the exact source-owned persona plan', async () => {
  const stack = await parseH3BStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3BContract(
    stack.contract,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const plan = buildH3BPlan(stack.contract);
  assert.deepEqual(
    plan.personas.map((persona) => persona.personaId),
    ['hearth_keeper', 'path_tender', 'record_steward'],
  );
  assert.deepEqual(
    plan.personas.map((persona) => persona.nativeHairStyleId),
    ['cropped_coils', 'swept_ridge', 'long'],
  );
  assert.deepEqual(
    plan.personas.map((persona) => persona.hairColor),
    ['#2D201C', '#161A20', '#5A3828'],
  );
  assert.equal(plan.personas[2].h3aShadowStyleId, 'braided_crown');
  assert.equal(plan.personas[2].nativeStyleParityClaimed, false);
  assert.equal(
    plan.studioPresentation.wardrobeNativeChannelClaimed,
    false,
  );
  assert.deepEqual(
    plan.expressions.map((expression) => expression.expressionId),
    ['neutral', 'soft_smile', 'blink', 'viseme_aa', 'viseme_ee', 'viseme_oh'],
  );
});

test('H3B sovereign character bundles are deterministic, UV-complete, and monotonic', async () => {
  const stack = await parseH3BStack(ROOT, HOLOSCRIPT_ROOT);
  const plan = buildH3BPlan(stack.contract);
  const native = await compileH3BNativeBundles(
    stack.core,
    stack.source.ast,
    plan,
  );
  assert.equal(native.records.length, 3);
  assert.equal(
    native.records.flatMap((record) => record.tiers).length,
    9,
  );
  for (const record of native.records) {
    const [lod0, lod1, lod2] = record.tiers;
    assert.ok(lod0.vertexCount > lod1.vertexCount);
    assert.ok(lod1.vertexCount > lod2.vertexCount);
    assert.ok(lod0.hairTriangleCount > lod1.hairTriangleCount);
    assert.ok(lod1.hairTriangleCount > lod2.hairTriangleCount);
    for (const tier of record.tiers) {
      assert.equal(tier.bundle.format, 'character-webgpu/drawspec');
      assert.equal(tier.bundle.mesh.uvs.length, tier.vertexCount * 2);
      assert.deepEqual(tier.report.stubbed, []);
      assert.equal(
        tier.report.mapped.some(
          (entry) =>
            entry.startsWith('@lod(') && entry.includes('hair_guides='),
        ),
        true,
      );
    }
  }
  assert.equal(native.expressionBundles.length, 6);
  for (const expression of native.expressionBundles) {
    assert.equal(
      expression.morph.schemaVersion,
      'holoscript.native-facial-morph.v1',
    );
    assert.equal(expression.morph.normalsRecomputed, false);
    assert.deepEqual(expression.morph.ignoredTargets, []);
    if (expression.expressionId !== 'neutral') {
      assert.ok(expression.morph.changedVertexCount > 0);
    }
  }
});

test('H3B fails closed on production overclaims and a second LOD authority', async () => {
  const stack = await parseH3BStack(ROOT, HOLOSCRIPT_ROOT);
  const contract = structuredClone(stack.contract);
  contract.state.fullH3Claimed = true;
  contract.state.productionFaceCompleteClaimed = true;
  contract.state.motionReprojectionClaimed = true;
  contract.state.photorealismClaimed = true;
  contract.state.lod.secondLodAuthorityAllowed = true;
  contract.state.studioPresentation.wardrobeNativeChannelClaimed = true;
  const validation = validateH3BContract(contract, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /fullH3Claimed/);
  assert.match(errors, /productionFaceCompleteClaimed/);
  assert.match(errors, /motionReprojectionClaimed/);
  assert.match(errors, /photorealismClaimed/);
  assert.match(errors, /native hair LOD contract drifted/);
  assert.match(errors, /studio presentation boundary drifted/);
});
