import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildPhysicalPlan,
  deriveMantleBinding,
  extractResidentBrowserApplication,
  projectMantleBodyCollision,
  validatePhysicalConvergenceContract,
} from '../check-hololand-model-village-physical-convergence.mjs';
import { canonicalJson } from '../check-hololand-model-village-receipt-loom-courtyard.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-physical-convergence.holo',
);
const POLICY = path.join(
  ROOT,
  'source/proofs/model-village-receipt-loom-physical-convergence-policy.hsplus',
);
const SEED = path.join(
  ROOT,
  'source/proofs/model-village-receipt-loom-physical-convergence-seed.hs',
);
const MANIFEST = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-physical-convergence-manifest.holo',
);
const RESIDENT_BRIDGE = path.join(
  ROOT,
  'scripts/check-hololand-model-village-resident-convergence.mjs',
);
const DISPLAY_NAMES = ['Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM', 'Brittney'];
const COUPLED_SYSTEMS = [
  'resident_mantles',
  'rain_streaks',
  'wind_foliage',
  'chimney_smoke',
  'cistern_ripples',
];

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

async function parseHolo(sourcePath) {
  const core = await loadCore();
  const parsed = new core.HoloCompositionParser().parse(
    readFileSync(sourcePath, 'utf8'),
  );
  assert.equal(parsed.success, true, JSON.stringify(parsed.errors));
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

test('Physical Convergence F parses and validates as a bounded public physics projection', async () => {
  const contract = await parseHolo(SOURCE);
  const result = validatePhysicalConvergenceContract(
    contract,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.equal(contract.metadata.worldName, 'Stormglass Commons');
  assert.equal(contract.metadata.artStyle, 'hearthlight_biorealism');
  assert.equal(contract.state.namedResidentCount, 6);
  assert.deepEqual(contract.state.publicDisplayNames, DISPLAY_NAMES);
  assert.equal(contract.state.solver.fixedStepHz, 120);
  assert.equal(contract.state.nativeGpuPhysicsClaimed, false);
});

test('the Physical F plan is deterministic and binds one wind field across five systems', async () => {
  const contract = await parseHolo(SOURCE);
  const first = buildPhysicalPlan(contract);
  const second = buildPhysicalPlan(contract);
  assert.deepEqual(first, second);
  assert.equal(sha256(canonicalJson(first)).length, 64);
  assert.deepEqual(first.sharedWind.coupledSystems, COUPLED_SYSTEMS);
  assert.equal(first.terrainContact.totalSoleProbes, 12);
  assert.equal(first.mantleBinding.expectedTotalDynamicVertices, 468);
});

test('dedicated HoloScript parsers accept the hsplus policy and hs seed', async () => {
  const core = await loadCore();
  const policy = new core.HoloScriptPlusParser().parse(
    readFileSync(POLICY, 'utf8'),
  );
  const seed = new core.HoloScriptCodeParser().parse(
    readFileSync(SEED, 'utf8'),
  );
  assert.equal(policy.success, true, JSON.stringify(policy.errors));
  assert.equal(seed.success, true, JSON.stringify(seed.errors));
  const policyComposition = policy.ast.children.find(
    (node) => node.type === 'composition',
  );
  const runtimeBinding = policyComposition.children.find(
    (node) =>
      node.type === 'template'
      && node.name === 'HoloScriptClothRuntimeBinding',
  );
  const seedResidents = seed.ast.filter(
    (node) => node.properties.type === 'resident_physical_seed',
  );
  assert.equal(
    runtimeBinding.properties.runtimeClass,
    'DeterministicClothSimulation',
  );
  assert.equal(runtimeBinding.properties.nativeGpuPhysicsClaimed, false);
  assert.equal(seedResidents.length, 6);
  assert.deepEqual(
    seedResidents
      .sort((left, right) => left.properties.order - right.properties.order)
      .map((node) => node.properties.publicDisplayName),
    DISPLAY_NAMES,
  );
});

test('all six immutable resident bundles produce the exact mantle UV binding', async () => {
  const residentContract = await parseHolo(
    path.join(
      ROOT,
      'source/layers/vr/frontier/model-village/model-village-receipt-loom-resident-convergence.holo',
    ),
  );
  const residents = residentContract.nodes.filter(
    (node) =>
      node.type === 'mesh'
      && node.props?.properties?.characterBundle
      && node.props?.properties?.publicDisplayName,
  );
  assert.equal(residents.length, 6);
  for (const resident of residents) {
    const bundle = JSON.parse(
      readFileSync(
        path.resolve(ROOT, resident.props.properties.characterBundle),
        'utf8',
      ),
    );
    const binding = deriveMantleBinding(bundle, 3);
    assert.equal(binding.vertices.length, 91);
    assert.equal(binding.dynamicVertices.length, 78);
    assert.equal(binding.pinnedVertices.length, 13);
    assert.equal(binding.indices.length, 432);
  }
});

test('the body projector observes and removes capsule-profile penetration', async () => {
  const contract = await parseHolo(SOURCE);
  const bundle = JSON.parse(
    readFileSync(
      path.join(
        ROOT,
        'assets/model-village/residents/stormglass-openai-cloth-mantle-lod0.character.json',
      ),
      'utf8',
    ),
  );
  const binding = deriveMantleBinding(bundle, 3);
  const projected = projectMantleBodyCollision(
    new Float32Array(bundle.mesh.positions),
    binding.vertices,
    contract.state.bodyCollision,
  );
  assert.ok(projected.correctionCount > 0);
  assert.ok(projected.maximumCorrection > 0);
  assert.ok(
    projected.residualMaximumPenetration
      <= contract.state.bodyCollision.maximumAllowedPenetrationMeters,
  );
});

test('Physical F seals immutable Resident E and its extracted browser application', async () => {
  const contract = await parseHolo(SOURCE);
  for (const [pathKey, hashKey] of [
    ['residentSource', 'residentSourceSha256'],
    ['residentBridge', 'residentBridgeSha256'],
    ['residentTest', 'residentTestSha256'],
    ['residentReport', 'residentReportSha256'],
    ['residentHero', 'residentHeroSha256'],
    ['residentManifest', 'residentManifestSha256'],
  ]) {
    assert.equal(
      sha256File(path.resolve(ROOT, contract.metadata[pathKey])),
      contract.metadata[hashKey],
      pathKey,
    );
  }
  const application = extractResidentBrowserApplication(
    readFileSync(RESIDENT_BRIDGE, 'utf8'),
  );
  assert.equal(
    sha256(application),
    contract.metadata.residentBrowserApplicationSha256,
  );
  assert.match(application, /^async function residentConvergenceBrowserApplication\(/);
});

test('the Physical F contract fails closed on research, writes, calls, or GPU-physics drift', async () => {
  const contract = JSON.parse(JSON.stringify(await parseHolo(SOURCE)));
  contract.state.researchLiveBlindedCompatible = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.modelCallsAllowed = true;
  contract.state.nativeGpuPhysicsClaimed = true;
  contract.state.clothSelfCollisionClaimed = true;
  const result = validatePhysicalConvergenceContract(
    contract,
    ROOT,
    HOLOSCRIPT_ROOT,
  );
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /researchLiveBlindedCompatible/);
  assert.match(result.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(result.errors.join('\n'), /modelCallsAllowed/);
  assert.match(result.errors.join('\n'), /nativeGpuPhysicsClaimed/);
  assert.match(result.errors.join('\n'), /clothSelfCollisionClaimed/);
});

test(
  'the immutable F manifest binds every durable artifact and preserves the CPU/GPU boundary',
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
      manifest.state.contactSheet,
    ]) {
      assert.equal(sha256File(path.resolve(ROOT, binding.path)), binding.sha256);
    }
    assert.equal(manifest.state.hero.width, 1600);
    assert.equal(manifest.state.hero.height, 900);
    assert.equal(manifest.state.contactSheet.width, 2400);
    assert.equal(manifest.state.contactSheet.height, 450);
    assert.equal(manifest.state.physics.solverDevice, 'cpu');
    assert.equal(manifest.state.physics.totalDynamicMantleVertices, 468);
    assert.equal(manifest.state.physics.replayAccepted, true);
    assert.equal(manifest.state.boundaries.nativeGpuPhysicsClaimed, false);
    assert.equal(manifest.state.boundaries.separateFromLiveExperiment, true);
    assert.equal(manifest.state.boundaries.canonicalWritesAllowed, false);
    assert.equal(manifest.state.boundaries.modelCalls, 0);
  },
);
