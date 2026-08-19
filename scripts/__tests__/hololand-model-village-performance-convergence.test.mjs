import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildPerformancePlan,
  compileFamilyLodBundles,
  validatePerformanceConvergenceContract,
} from '../check-hololand-model-village-performance-convergence.mjs';
import { canonicalJson } from '../check-hololand-model-village-receipt-loom-courtyard.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-performance-convergence.holo',
);
const POLICY = path.join(
  ROOT,
  'source/proofs/model-village-receipt-loom-performance-convergence-policy.hsplus',
);
const SEED = path.join(
  ROOT,
  'source/proofs/model-village-receipt-loom-performance-convergence-seed.hs',
);
const FAMILY_SOURCE = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-family-mantle-catalog.holo',
);
const MANIFEST = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-performance-convergence-manifest.holo',
);
const DISPLAY_NAMES = ['Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM', 'Brittney'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function stateProperties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value]),
  );
}

function flatten(node, result = []) {
  result.push(node);
  for (const child of node?.children || []) flatten(child, result);
  return result;
}

async function loadCore() {
  return import(
    pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
  );
}

async function loadEngine() {
  return import(
    pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/engine/dist/index.js')).href
  );
}

async function parseHolo(sourcePath) {
  const core = await loadCore();
  const parsed = new core.HoloCompositionParser().parse(
    readFileSync(sourcePath, 'utf8'),
  );
  assert.equal(parsed.success, true, JSON.stringify(parsed.errors));
  assert.deepEqual(parsed.errors, []);
  const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(parsed.ast);
  return {
    metadata: parsed.ast.metadata,
    state: stateProperties(parsed.ast.state),
    environment: stateProperties(parsed.ast.environment),
    nodes: flatten(sceneIr)
      .filter((node) => node.type !== 'group')
      .map((node) => ({
        id: node.id || null,
        type: node.type,
        props: node.props || {},
      })),
  };
}

test('Performance Convergence G parses and validates as a bounded measured local profile', async () => {
  const contract = await parseHolo(SOURCE);
  const result = validatePerformanceConvergenceContract(
    contract,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.equal(contract.metadata.worldName, 'Stormglass Commons');
  assert.equal(contract.metadata.artStyle, 'hearthlight_biorealism');
  assert.equal(contract.state.measuredQualityProfile, 'desktop_cinematic_g1');
  assert.equal(contract.state.qualityProfile.warmupFrames, 600);
  assert.equal(contract.state.qualityProfile.measuredFrames, 1800);
  assert.equal(contract.state.concurrentPhysicsAndRenderPerformanceClaimed, false);
  assert.equal(contract.state.productionTaaClaimed, false);
});

test('the G plan and profile hash are deterministic', async () => {
  const contract = await parseHolo(SOURCE);
  const first = buildPerformancePlan(contract);
  const second = buildPerformancePlan(contract);
  assert.deepEqual(first, second);
  assert.equal(sha256(canonicalJson(first)).length, 64);
  assert.deepEqual(
    first.namedResidents.map((resident) => resident.publicDisplayName),
    DISPLAY_NAMES,
  );
  assert.deepEqual(
    first.lod.levels.map((level) => level.distanceMeters),
    [0, 12, 28],
  );
});

test('dedicated HoloScript parsers accept the G hsplus policy and hs seed', async () => {
  const core = await loadCore();
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
  const policyComposition = policy.ast.children.find(
    (node) => node.type === 'composition',
  );
  const lodBinding = policyComposition.children.find(
    (node) =>
      node.type === 'template'
      && node.name === 'HoloScriptLodRuntimeBinding',
  );
  const temporal = policyComposition.children.find(
    (node) =>
      node.type === 'template'
      && node.name === 'StaticTemporalAccumulationContract',
  );
  const residents = seed.ast.filter(
    (node) => node.properties.type === 'resident_performance_seed',
  );
  const resets = seed.ast.filter(
    (node) => node.properties.type === 'temporal_history_reset_seed',
  );
  assert.equal(lodBinding.properties.runtimeClass, 'LODManager');
  assert.equal(temporal.properties.motionReprojectionClaimed, false);
  assert.equal(temporal.properties.productionTaaClaimed, false);
  assert.equal(residents.length, 6);
  assert.equal(resets.length, 4);
});

test('HoloScript LODManager selects near, mid, and far tiers with hysteresis', async () => {
  const engine = await loadEngine();
  const manager = new engine.LODManager({
    autoUpdate: false,
    collectMetrics: true,
  });
  manager.register(
    'resident',
    {
      id: 'resident',
      strategy: 'distance',
      transition: 'instant',
      transitionDuration: 0,
      levels: [
        {
          level: 0,
          distance: 0,
          polygonRatio: 1,
          textureScale: 1,
          disabledFeatures: [],
        },
        {
          level: 1,
          distance: 12,
          polygonRatio: 0.78,
          textureScale: 1,
          disabledFeatures: [],
        },
        {
          level: 2,
          distance: 28,
          polygonRatio: 0.66,
          textureScale: 1,
          disabledFeatures: [],
        },
      ],
      hysteresis: 0.08,
      bias: 0,
      fadeEnabled: false,
      enabled: true,
    },
    [0, 0, 0],
  );
  for (const [distance, expected] of [[8, 0], [18, 1], [36, 2]]) {
    manager.update([distance, 0, 0]);
    assert.equal(manager.getCurrentLevel('resident'), expected);
  }
  manager.update([12.5, 0, 0]);
  assert.equal(manager.getCurrentLevel('resident'), 1);
  manager.update([10, 0, 0]);
  assert.equal(manager.getCurrentLevel('resident'), 0);
});

test('all six family residents compile deterministic operative LOD0/1/2 tiers', async () => {
  const core = await loadCore();
  const records = await compileFamilyLodBundles(
    core,
    readFileSync(FAMILY_SOURCE, 'utf8'),
  );
  assert.equal(records.length, 6);
  assert.deepEqual(
    records.map((record) => record.publicDisplayName),
    DISPLAY_NAMES,
  );
  for (const record of records) {
    assert.equal(record.repeatedCompileByteIdentical, true);
    assert.equal(record.fallbackUsed, false);
    assert.equal(record.tiers.length, 3);
    assert.deepEqual(record.tiers.map((tier) => tier.level), [0, 1, 2]);
    assert.ok(record.tiers[0].vertexCount > record.tiers[1].vertexCount);
    assert.ok(record.tiers[1].vertexCount > record.tiers[2].vertexCount);
    assert.ok(record.tiers[0].triangleCount > record.tiers[1].triangleCount);
    assert.ok(record.tiers[1].triangleCount > record.tiers[2].triangleCount);
    assert.equal(new Set(record.tiers.map((tier) => tier.mantleStyle)).size, 1);
    assert.ok(record.tiers.every((tier) => tier.sha256.length === 64));
  }
});

test('G seals every immutable Physical F artifact plus LOD and TAA runtime sources', async () => {
  const contract = await parseHolo(SOURCE);
  for (const [pathKey, hashKey, base] of [
    ['inheritedPhysicalSource', 'inheritedPhysicalSourceSha256', ROOT],
    ['inheritedPhysicalPolicy', 'inheritedPhysicalPolicySha256', ROOT],
    ['inheritedPhysicalSeed', 'inheritedPhysicalSeedSha256', ROOT],
    ['inheritedPhysicalChecker', 'inheritedPhysicalCheckerSha256', ROOT],
    ['inheritedPhysicalTest', 'inheritedPhysicalTestSha256', ROOT],
    ['inheritedPhysicalReport', 'inheritedPhysicalReportSha256', ROOT],
    ['inheritedPhysicalHero', 'inheritedPhysicalHeroSha256', ROOT],
    ['inheritedPhysicalContactSheet', 'inheritedPhysicalContactSheetSha256', ROOT],
    ['inheritedPhysicalManifest', 'inheritedPhysicalManifestSha256', ROOT],
    ['familyMantleSource', 'familyMantleSourceSha256', ROOT],
    ['holoScriptLodManagerSource', 'holoScriptLodManagerSourceSha256', HOLOSCRIPT_ROOT],
    ['holoScriptLodTypesSource', 'holoScriptLodTypesSourceSha256', HOLOSCRIPT_ROOT],
    ['temporalPassSource', 'temporalPassSourceSha256', HOLOSCRIPT_ROOT],
  ]) {
    assert.equal(
      sha256File(path.resolve(base, contract.metadata[pathKey])),
      contract.metadata[hashKey],
      pathKey,
    );
  }
});

test('the G contract fails closed on writes, research, native TAA, XR, or overclaim drift', async () => {
  const contract = JSON.parse(JSON.stringify(await parseHolo(SOURCE)));
  contract.state.researchLiveBlindedCompatible = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.modelCallsAllowed = true;
  contract.state.concurrentPhysicsAndRenderPerformanceClaimed = true;
  contract.state.motionReprojectionClaimed = true;
  contract.state.dynamicResolutionClaimed = true;
  contract.state.headsetPerformanceClaimed = true;
  contract.state.nativeWebGpuTaaClaimed = true;
  contract.state.productionTaaClaimed = true;
  const result = validatePerformanceConvergenceContract(
    contract,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /researchLiveBlindedCompatible/);
  assert.match(result.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(result.errors.join('\n'), /modelCallsAllowed/);
  assert.match(
    result.errors.join('\n'),
    /concurrentPhysicsAndRenderPerformanceClaimed/,
  );
  assert.match(result.errors.join('\n'), /motionReprojectionClaimed/);
  assert.match(result.errors.join('\n'), /dynamicResolutionClaimed/);
  assert.match(result.errors.join('\n'), /headsetPerformanceClaimed/);
  assert.match(result.errors.join('\n'), /nativeWebGpuTaaClaimed/);
  assert.match(result.errors.join('\n'), /productionTaaClaimed/);
});

test(
  'the immutable G manifest binds durable outputs and preserves the bounded TAA claim',
  { skip: !existsSync(MANIFEST) },
  async () => {
    const manifest = await parseHolo(MANIFEST);
    for (const binding of [
      manifest.state.source,
      manifest.state.policy,
      manifest.state.seed,
      manifest.state.checker,
      manifest.state.test,
      manifest.state.report,
      manifest.state.hero,
      manifest.state.comparison,
    ]) {
      assert.equal(sha256File(path.resolve(ROOT, binding.path)), binding.sha256);
    }
    assert.equal(manifest.state.profile.id, 'desktop_cinematic_g1');
    assert.equal(manifest.state.profile.warmupFrames, 600);
    assert.equal(manifest.state.profile.measuredFrames, 1800);
    assert.equal(manifest.state.temporal.mode, 'static_jittered_accumulation');
    assert.equal(manifest.state.boundaries.motionReprojectionClaimed, false);
    assert.equal(manifest.state.boundaries.productionTaaClaimed, false);
    assert.equal(manifest.state.boundaries.separateFromLiveExperiment, true);
    assert.equal(manifest.state.boundaries.canonicalWritesAllowed, false);
    assert.equal(manifest.state.boundaries.modelCalls, 0);
  },
);
