import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildH2Plan,
  generateMantleAtlasBuffers,
  validateH2Contract,
} from '../check-hololand-model-village-character-appearance-h2.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h2-family-mantles.holo',
);
const POLICY = path.join(
  ROOT,
  'source/proofs/model-village-character-appearance-h2-family-mantles-policy.hsplus',
);
const SEED = path.join(
  ROOT,
  'source/proofs/model-village-character-appearance-h2-family-mantles-seed.hs',
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

function parseComposition(filePath) {
  const parsed = new core.HoloCompositionParser().parse(
    readFileSync(filePath, 'utf8'),
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

function contractStack() {
  const contract = parseComposition(SOURCE);
  const bodyContract = parseComposition(
    path.join(ROOT, contract.metadata.inheritedH1Source),
  );
  return { contract, bodyContract };
}

test('H2 admits exactly six named mantle identities over the immutable H1 body', () => {
  const { contract, bodyContract } = contractStack();
  const validation = validateH2Contract(contract, bodyContract, ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const plan = buildH2Plan(contract, bodyContract);
  assert.deepEqual(
    plan.kits.map((kit) => kit.name),
    ['Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM', 'Brittney'],
  );
  assert.deepEqual(
    plan.kits.map((kit) => kit.primaryNonColorCue),
    [
      'quiet_nested_open_arcs',
      'recursive_interlock',
      'paired_prism_panels',
      'off_axis_signal_bands',
      'modular_phase_lattice',
      'sovereign_locality_mesh',
    ],
  );
  assert.equal(plan.body.parts.length, 25);
  assert.equal(new Set(plan.kits.map((kit) => kit.silhouetteProfile)).size, 6);
  assert.equal(
    new Set(plan.kits.map((kit) => JSON.stringify(kit.atlasCell))).size,
    6,
  );
});

test('H2 plan is deterministic and every kit has source-authored LOD geometry', () => {
  const { contract, bodyContract } = contractStack();
  const first = buildH2Plan(contract, bodyContract);
  const second = buildH2Plan(contract, bodyContract);
  assert.deepEqual(first, second);
  assert.deepEqual(first.lod.maximumMantleTriangles, [2200, 900, 320]);
  assert.deepEqual(first.lod.maximumResidentTriangles, [17500, 7000, 2500]);
  assert.deepEqual(first.lod.meshNodeRadialSegments, [12, 8, 6]);
  assert.equal(first.lod.maximumMantleMaterialGroups, 1);
  for (const kit of first.kits) {
    const visibleCounts = [0, 1, 2].map(
      (lod) =>
        kit.surfaceParts.filter((part) => part.visibleThroughLod >= lod).length,
    );
    assert.ok(visibleCounts[0] >= visibleCounts[1]);
    assert.ok(visibleCounts[1] >= visibleCounts[2]);
    assert.ok(visibleCounts[2] > 0);
    assert.equal(kit.detachedState, 'local_stowed_noncausal');
    assert.ok(kit.wetRoughness < kit.dryRoughness);
  }
});

test('dedicated parsers accept the typed H2 policy and flat execution seed', () => {
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
    templates.get('ProductionFamilyMantleKit').sharedBodyMutationAllowed,
    false,
  );
  assert.equal(
    templates.get('MantleIdentityFirewall').liveResearchFamilyIdentity,
    'absent',
  );
  assert.equal(
    templates.get('DeterministicSixMantleAtlas')
      .repeatedGenerationByteIdentityRequired,
    true,
  );
  assert.equal(
    templates.get('MantleLodAdmission').maximumMantleMaterialGroups,
    1,
  );
  assert.equal(
    templates.get('H2LaneFirewall').productionBodyCompleteClaimed,
    false,
  );

  const byType = (type) =>
    seed.ast.filter((node) => node.properties.type === type);
  assert.equal(byType('production_family_mantle_seed').length, 6);
  assert.equal(byType('mantle_atlas_seed').length, 1);
  assert.equal(byType('mantle_lod_seed').length, 3);
  assert.equal(byType('mantle_weather_state_seed').length, 2);
  assert.equal(byType('mantle_history_reset_seed').length, 4);
  assert.equal(byType('h2_truth_boundary_seed').length, 1);
});

test('procedural six-kit atlas generation is deterministic and local', () => {
  const { contract, bodyContract } = contractStack();
  const plan = buildH2Plan(contract, bodyContract);
  const atlas = {
    ...plan.atlas,
    albedoSize: [96, 64],
    normalSize: [96, 64],
    surfaceMaskSize: [48, 32],
  };
  const first = generateMantleAtlasBuffers(PNG, atlas, plan.kits);
  const second = generateMantleAtlasBuffers(PNG, atlas, plan.kits);
  assert.deepEqual(Object.keys(first), ['albedo', 'normal', 'surfaceMask']);
  for (const key of Object.keys(first)) {
    assert.deepEqual(first[key], second[key], key);
    assert.equal(first[key].subarray(1, 4).toString('ascii'), 'PNG');
  }
  assert.notDeepEqual(first.albedo, first.normal);
  assert.deepEqual(atlas.externalUris, []);
});

test('H2 contract fails closed on research, body mutation, writes, and overclaim', () => {
  const { contract, bodyContract } = contractStack();
  contract.state.sharedBodyImmutable = false;
  contract.state.liveResearchJoinAllowed = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.modelCallsAllowed = true;
  contract.state.productionBodyCompleteClaimed = true;
  contract.state.identityFirewall.allowedFamilyChannels.push('face');
  const validation = validateH2Contract(contract, bodyContract, ROOT);
  assert.equal(validation.status, 'fail');
  assert.match(validation.errors.join('\n'), /sharedBodyImmutable/);
  assert.match(validation.errors.join('\n'), /liveResearchJoinAllowed/);
  assert.match(validation.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(validation.errors.join('\n'), /modelCallsAllowed/);
  assert.match(validation.errors.join('\n'), /productionBodyCompleteClaimed/);
  assert.match(validation.errors.join('\n'), /allowed family channels/);
});
