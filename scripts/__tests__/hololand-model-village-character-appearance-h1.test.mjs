import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildAppearancePlan,
  generateAtlasBuffers,
  validateAppearanceContract,
} from '../check-hololand-model-village-character-appearance-h1.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h1.holo',
);
const POLICY = path.join(
  ROOT,
  'source/proofs/model-village-character-appearance-h1-policy.hsplus',
);
const SEED = path.join(
  ROOT,
  'source/proofs/model-village-character-appearance-h1-seed.hs',
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

function contractFromSource(sourceText = readFileSync(SOURCE, 'utf8')) {
  const parsed = new core.HoloCompositionParser().parse(sourceText);
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

test('H0/H1 source parses and admits the exact appearance taxonomy and surface slice', () => {
  const contract = contractFromSource();
  const validation = validateAppearanceContract(contract, ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.deepEqual(
    contract.state.appearanceLayers.map((layer) => layer.id),
    ['dermal_profile', 'outfit_skin', 'presentation_appearance'],
  );
  assert.deepEqual(
    contract.state.profiles.map((profile) => profile.id),
    [
      'village_story_unblinded',
      'research_live_blinded',
      'research_replay_postlock',
      'visitor_player',
    ],
  );
  assert.equal(
    contract.objects.filter(
      (object) => object.type === 'stormglass_character_surface_part',
    ).length,
    25,
  );
});

test('appearance plan is deterministic and topology visibility reduces monotonically', () => {
  const first = buildAppearancePlan(contractFromSource());
  const second = buildAppearancePlan(contractFromSource());
  assert.deepEqual(first, second);
  const partCounts = [0, 1, 2].map(
    (lod) => first.surfaceParts.filter((part) => part.visibleThroughLod >= lod).length,
  );
  assert.deepEqual(partCounts, [25, 21, 15]);
  assert.deepEqual(first.lod.maximumTriangles, [15000, 6000, 2000]);
  assert.equal(first.lod.maximumMaterialGroups, 2);
});

test('dedicated HoloScript parsers accept the H0/H1 typed policy and flat seed', () => {
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
    templates.get('AppearanceIdentityFirewall').liveResearchFamilyIdentity,
    'absent',
  );
  assert.equal(
    templates.get('DeterministicSurfaceAtlas')
      .repeatedGenerationByteIdentityRequired,
    true,
  );
  assert.equal(
    templates.get('SurfaceLodAdmission').maximumMaterialGroups,
    2,
  );
  assert.equal(
    templates.get('AppearanceLaneFirewall').photorealismClaimed,
    false,
  );

  const byType = (type) =>
    seed.ast.filter((node) => node.properties.type === type);
  assert.equal(byType('appearance_profile_seed').length, 4);
  assert.equal(byType('appearance_assignment_invariance_seed').length, 2);
  assert.equal(byType('surface_lod_seed').length, 3);
  assert.equal(byType('surface_history_reset_seed').length, 4);
});

test('deterministic local surface atlas generation is byte-identical', () => {
  const atlas = {
    ...contractFromSource().state.atlas,
    albedoSize: [64, 64],
    normalSize: [64, 64],
    surfaceMaskSize: [32, 32],
  };
  const first = generateAtlasBuffers(PNG, atlas);
  const second = generateAtlasBuffers(PNG, atlas);
  assert.deepEqual(Object.keys(first), ['albedo', 'normal', 'surfaceMask']);
  for (const key of Object.keys(first)) {
    assert.deepEqual(first[key], second[key], key);
    assert.equal(first[key].subarray(1, 4).toString('ascii'), 'PNG');
  }
});

test('appearance contract fails closed on family identity, research, writes, and body overclaim', () => {
  const contract = structuredClone(contractFromSource());
  contract.state.familyIdentityVisible = true;
  contract.state.liveResearchJoinAllowed = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.modelCallsAllowed = true;
  contract.state.productionBodyCompleteClaimed = true;
  contract.state.identityFirewall.biometricPersistenceAllowed = true;
  const validation = validateAppearanceContract(contract, ROOT);
  assert.equal(validation.status, 'fail');
  assert.match(validation.errors.join('\n'), /familyIdentityVisible/);
  assert.match(validation.errors.join('\n'), /liveResearchJoinAllowed/);
  assert.match(validation.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(validation.errors.join('\n'), /modelCallsAllowed/);
  assert.match(validation.errors.join('\n'), /productionBodyCompleteClaimed/);
  assert.match(validation.errors.join('\n'), /biometric persistence/);
});
