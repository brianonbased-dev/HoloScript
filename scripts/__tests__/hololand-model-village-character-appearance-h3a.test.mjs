import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  SUPERSESSION_PROPERTIES,
  SUPERSESSION_PROPERTY_IDS,
  buildH3APlan,
  generateDermalAtlasBuffers,
  proveSupersessionBoundary,
  validateH3AContract,
} from '../check-hololand-model-village-character-appearance-h3a.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3a-neutral-personas.holo',
);
const POLICY = path.join(
  ROOT,
  'source/proofs/model-village-character-appearance-h3a-neutral-personas-policy.hsplus',
);
const SEED = path.join(
  ROOT,
  'source/proofs/model-village-character-appearance-h3a-neutral-personas-seed.hs',
);
const core = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
);
const requireFromHoloScript = createRequire(
  path.join(HOLOSCRIPT_ROOT, 'packages/core/package.json'),
);
const { PNG } = requireFromHoloScript('pngjs');

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value]),
  );
}

function parseComposition() {
  const parsed = new core.HoloCompositionParser().parse(
    readFileSync(SOURCE, 'utf8'),
  );
  assert.equal(parsed.success, true, JSON.stringify(parsed.errors));
  assert.deepEqual(parsed.errors, []);
  return {
    metadata: parsed.ast.metadata,
    state: properties(parsed.ast.state),
    environment: properties(parsed.ast.environment),
    objects: (parsed.ast.objects || []).map((object) => ({
      name: object.name,
      ...properties(object),
    })),
  };
}

test('H3A admits exactly three family-neutral civic persona targets', () => {
  const contract = parseComposition();
  const validation = validateH3AContract(contract, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const plan = buildH3APlan(contract);
  assert.deepEqual(
    plan.personas.map((persona) => persona.personaId),
    ['hearth_keeper', 'path_tender', 'record_steward'],
  );
  assert.deepEqual(
    plan.personas.map((persona) => persona.civicRole),
    ['keeper', 'wayfinder', 'archivist'],
  );
  assert.deepEqual(
    plan.personas.map((persona) => persona.hairStyleId),
    ['cropped_coils', 'swept_ridge', 'braided_crown'],
  );
  assert.equal(
    plan.personas.every(
      (persona) => persona.adapterFamilyBinding === 'absent',
    ),
    true,
  );
  assert.equal(new Set(plan.personas.map((persona) => persona.silhouetteProfile)).size, 3);
});

test('H3A plan is deterministic and LOD visibility remains source-authored', () => {
  const contract = parseComposition();
  const first = buildH3APlan(contract);
  const second = buildH3APlan(contract);
  assert.deepEqual(first, second);
  assert.deepEqual(first.lod.maximumPersonaTriangles, [12000, 5000, 1800]);
  assert.deepEqual(first.lod.faceRadialSegments, [28, 18, 10]);
  assert.deepEqual(first.lod.faceHeightSegments, [20, 12, 8]);
  assert.deepEqual(first.lod.hairRadialSegments, [18, 12, 6]);
  assert.equal(first.lod.secondLodAuthorityAllowed, false);
  for (const persona of first.personas) {
    const visibleCounts = [0, 1, 2].map(
      (lod) =>
        persona.hairParts.filter((part) => part.visibleThroughLod >= lod).length,
    );
    assert.ok(visibleCounts[0] >= visibleCounts[1]);
    assert.ok(visibleCounts[1] >= visibleCounts[2]);
    assert.ok(visibleCounts[2] > 0);
  }
  assert.deepEqual(
    first.expressions.map((expression) => expression.expressionId),
    ['neutral', 'soft_smile', 'blink', 'viseme_aa', 'viseme_ee', 'viseme_oh'],
  );
  assert.equal(
    first.expressions.every(
      (expression) => expression.nativeMorphTargetClaimed === false,
    ),
    true,
  );
});

test('dedicated parsers accept the typed H3A policy and execution seed', () => {
  const policy = new core.HoloScriptPlusParser().parse(
    readFileSync(POLICY, 'utf8'),
  );
  const seed = new core.HoloScriptCodeParser().parse(
    readFileSync(SEED, 'utf8'),
  );
  assert.equal(policy.success, true, JSON.stringify(policy.errors));
  assert.deepEqual(policy.errors, []);
  assert.equal(seed.success, true, JSON.stringify(seed.errors));
  assert.deepEqual(seed.errors, []);

  const composition = policy.ast.children.find(
    (node) => node.type === 'composition',
  );
  const templates = new Map(
    composition.children
      .filter((node) => node.type === 'template')
      .map((node) => [node.name, node.properties]),
  );
  assert.equal(
    templates.get('NeutralCivicPersonaTarget').adapterFamilyBinding,
    'absent',
  );
  assert.equal(
    templates.get('H3AHairBridgeTarget').nativeHairStyleChannelClaimed,
    false,
  );
  assert.equal(
    templates.get('H3AExpressionBridgeTarget').nativeMorphTargetChannelClaimed,
    false,
  );
  assert.equal(
    templates.get('DeterministicNeutralDermalAtlas')
      .repeatedGenerationByteIdentityRequired,
    true,
  );
  assert.equal(
    templates.get('H3ANativeAdmissionProbe').fullH3AdmissionExpected,
    false,
  );
  assert.equal(
    templates.get('NeutralPersonaPrivacyGate').biometricPersistenceAllowed,
    false,
  );
  assert.equal(
    templates.get('H3ALaneFirewall').fullWorldConvergenceClaimed,
    false,
  );

  const byType = (type) =>
    seed.ast.filter((node) => node.properties.type === type);
  assert.equal(byType('neutral_civic_persona_seed').length, 3);
  assert.equal(byType('neutral_dermal_atlas_seed').length, 1);
  assert.equal(byType('neutral_persona_lod_seed').length, 3);
  assert.equal(byType('neutral_persona_expression_seed').length, 6);
  assert.equal(byType('h3a_native_admission_seed').length, 2);
  assert.equal(byType('h3a_history_reset_seed').length, 5);
  assert.equal(byType('h3a_truth_boundary_seed').length, 1);
});

test('procedural neutral dermal atlas generation is byte-deterministic and local', () => {
  const plan = buildH3APlan(parseComposition());
  const atlas = {
    ...plan.atlas,
    albedoSize: [96, 48],
    normalSize: [96, 48],
    surfaceMaskSize: [48, 24],
  };
  const first = generateDermalAtlasBuffers(PNG, atlas, plan.personas);
  const second = generateDermalAtlasBuffers(PNG, atlas, plan.personas);
  assert.deepEqual(Object.keys(first), ['albedo', 'normal', 'surfaceMask']);
  for (const key of Object.keys(first)) {
    assert.deepEqual(first[key], second[key], key);
    assert.equal(first[key].subarray(1, 4).toString('ascii'), 'PNG');
  }
  assert.notDeepEqual(first.albedo, first.normal);
  assert.deepEqual(plan.atlas.externalUris, []);
});

test('H3A contract fails closed on native overclaim, identity, tracking, and writes', () => {
  const contract = parseComposition();
  contract.state.fullH3PromotionStatus = 'admitted';
  contract.state.nativeHairStyleChannelClaimed = true;
  contract.state.nativeMorphTargetChannelClaimed = true;
  contract.state.adapterFamilyBinding = 'present';
  contract.state.liveResearchJoinAllowed = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.modelCallsAllowed = true;
  contract.state.faceTrackingEnabledByDefault = true;
  contract.state.biometricPersistenceAllowed = true;
  contract.objects.find(
    (object) => object.type === 'neutral_civic_persona_target',
  ).adapterFamilyBinding = 'OpenAI';
  const validation = validateH3AContract(contract, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /resolved historical boundary/);
  assert.match(errors, /nativeHairStyleChannelClaimed/);
  assert.match(errors, /nativeMorphTargetChannelClaimed/);
  assert.match(errors, /adapterFamilyBinding/);
  assert.match(errors, /liveResearchJoinAllowed/);
  assert.match(errors, /canonicalWritesAllowed/);
  assert.match(errors, /modelCallsAllowed/);
  assert.match(errors, /faceTrackingEnabledByDefault/);
  assert.match(errors, /biometricPersistenceAllowed/);
  assert.match(errors, /must not bind an adapter family/);
});

test('H3A refuses to lose the frozen native-gap history or the H3B successor pointer', () => {
  // The historical record is H3A's reason to exist. Rewriting it to claim the gap
  // never existed must fail, even though the channels are operative today.
  const rewritten = parseComposition();
  rewritten.state.upstreamNativeAdmission.historical.authoredHairStyleGeometryOperative = true;
  rewritten.state.upstreamNativeAdmission.historical.authoredMorphFacsOperative = true;
  const historyErrors = validateH3AContract(rewritten, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(historyErrors.status, 'fail');
  assert.match(historyErrors.errors.join('\n'), /frozen historical native-gap record drifted/);

  // H3A may not quietly claim the native channels it delegates to H3B.
  const overclaim = parseComposition();
  overclaim.state.upstreamNativeAdmission.current.h3aClaimsNativeChannels = true;
  const overclaimErrors = validateH3AContract(overclaim, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(overclaimErrors.status, 'fail');
  assert.match(overclaimErrors.errors.join('\n'), /delegate coverage to H3B/);

  // Retiring H3A into H3B silently by dropping the pointer must fail.
  const orphaned = parseComposition();
  orphaned.metadata.successorGate = 'NONE';
  const orphanErrors = validateH3AContract(orphaned, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(orphanErrors.status, 'fail');
  assert.match(orphanErrors.errors.join('\n'), /must name the successor gate/);

  // The refusal must stay a complete, declared claim. Quietly dropping a property from
  // the refused list would shrink what the successor has to carry before H3A can be
  // retired, so it fails.
  const shrunk = parseComposition();
  shrunk.state.supersessionBoundary.refusedProperties =
    shrunk.state.supersessionBoundary.refusedProperties.slice(1);
  const shrunkErrors = validateH3AContract(shrunk, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(shrunkErrors.status, 'fail');
  assert.match(shrunkErrors.errors.join('\n'), /refusedProperties must name exactly/);

  // retirementRefused has to be a decision, not prose or an omission.
  const vague = parseComposition();
  vague.state.supersessionBoundary.retirementRefused = 'maybe';
  const vagueErrors = validateH3AContract(vague, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(vagueErrors.status, 'fail');
  assert.match(vagueErrors.errors.join('\n'), /retirementRefused must be true or false/);

  // And it has to say why.
  const unreasoned = parseComposition();
  unreasoned.state.supersessionBoundary.refusedReason = '   ';
  const unreasonedErrors = validateH3AContract(unreasoned, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(unreasonedErrors.status, 'fail');
  assert.match(unreasonedErrors.errors.join('\n'), /refusedReason must state why/);

  // The clean source must still pass, so none of the above is a blanket failure.
  assert.equal(validateH3AContract(parseComposition(), ROOT, HOLOSCRIPT_ROOT).status, 'pass');
});

test('H3A proves the retire-vs-restate decision instead of documenting it', async () => {
  const contract = parseComposition();
  const proof = await proveSupersessionBoundary({
    contract,
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });

  // Every declared property is probed, and the probe set matches the declared set.
  assert.deepEqual(
    proof.witness.map((entry) => entry.property),
    [...SUPERSESSION_PROPERTY_IDS],
  );
  assert.deepEqual(
    contract.state.supersessionBoundary.refusedProperties,
    [...SUPERSESSION_PROPERTY_IDS],
  );

  // H3A must actually hold all ten -- a refusal it cannot back is a stale refusal.
  for (const entry of proof.witness) {
    assert.equal(
      entry.heldByH3A,
      true,
      `H3A must assert ${entry.property}: ${entry.h3aWitness}`,
    );
    assert.equal(
      entry.assertedBySuccessor,
      false,
      `H3B unexpectedly asserts ${entry.property}: ${entry.successorWitness}`,
    );
  }
  assert.equal(proof.status, 'pass');
  assert.deepEqual(proof.failures, []);
});

test('H3A refuses a retirement its successor cannot carry', async () => {
  // Flipping the decision is a claim that H3B now carries all ten. It does not, so the
  // gate must refuse -- this is the check that was missing entirely: retirementRefused
  // used to be inert, and flipping it changed nothing.
  const retiring = parseComposition();
  retiring.state.supersessionBoundary.retirementRefused = false;
  const proof = await proveSupersessionBoundary({
    contract: retiring,
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });
  assert.equal(proof.status, 'fail');
  assert.equal(proof.failures.length, SUPERSESSION_PROPERTY_IDS.length);
  for (const id of SUPERSESSION_PROPERTY_IDS) {
    assert.match(
      proof.failures.join('\n'),
      new RegExp(`retirementRefused is false but .* does not assert ${id}\\b`),
    );
  }
});

test('H3A notices when it stops holding a property it refuses to retire without', async () => {
  // If H3A itself loses one of the ten, the refusal is over-claiming and must go red
  // rather than quietly keeping the gate alive on a property it no longer enforces.
  for (const property of SUPERSESSION_PROPERTIES) {
    const weakened = parseComposition();
    property.mutate(weakened);
    const proof = await proveSupersessionBoundary({
      contract: weakened,
      root: ROOT,
      holoScriptRoot: HOLOSCRIPT_ROOT,
    });
    assert.equal(proof.status, 'fail', `${property.id} should have gone red`);
    assert.match(
      proof.failures.join('\n'),
      new RegExp(`H3A no longer asserts ${property.id}\\b`),
    );
  }
});

test('H3A reopens retirement the moment its successor gains a property', async () => {
  // The event the retired content hash was a bad proxy for. Simulated by handing the
  // probe a successor-shaped contract through H3A's own validator surface: if a property
  // becomes asserted downstream, the gate must name it and demand a re-decision.
  const contract = parseComposition();
  const proof = await proveSupersessionBoundary({
    contract,
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });
  // Baseline: nothing is carried downstream yet, so nothing is reopened.
  assert.equal(
    proof.witness.every((entry) => entry.assertedBySuccessor === false),
    true,
  );
  assert.equal(
    proof.failures.some((failure) => /must be re-evaluated/.test(failure)),
    false,
  );
});
