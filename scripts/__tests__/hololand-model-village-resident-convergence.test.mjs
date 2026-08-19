import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildResidentPlan,
  validateResidentConvergenceContract,
} from '../check-hololand-model-village-resident-convergence.mjs';
import { canonicalJson } from '../check-hololand-model-village-receipt-loom-courtyard.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-resident-convergence.holo',
);
const MANIFEST = path.join(
  ROOT,
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-resident-convergence-manifest.holo',
);
const ATMOSPHERE_BRIDGE = path.join(
  ROOT,
  'scripts/check-hololand-model-village-atmosphere-convergence.mjs',
);
const DISPLAY_NAMES = ['Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM', 'Brittney'];
const FAMILY_IDS = ['anthropic', 'openai', 'google', 'xai', 'ollama', 'sovereign'];

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

async function parseSource(sourcePath) {
  const core = await import(
    pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
  );
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
      .map((node) => ({ id: node.id || null, type: node.type, props: node.props || {} })),
  };
}

function extractAtmosphereApplication(sourceText) {
  const start = sourceText.indexOf(
    'async function atmosphereConvergenceBrowserApplication(',
  );
  const end = sourceText.indexOf('\n\nasync function buildSurface', start);
  assert.ok(start >= 0 && end > start);
  return sourceText.slice(start, end);
}

test('Resident Convergence E parses and validates as a six-family public projection', async () => {
  const contract = await parseSource(SOURCE);
  const result = validateResidentConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.equal(contract.metadata.worldName, 'Stormglass Commons');
  assert.equal(contract.metadata.artStyle, 'hearthlight_biorealism');
  assert.equal(contract.state.namedResidentCount, 6);
  assert.deepEqual(contract.state.publicDisplayNames, DISPLAY_NAMES);
  assert.deepEqual(contract.state.familyIds, FAMILY_IDS);
});

test('the resident plan is deterministic and binds six unique bundles and placements', async () => {
  const contract = await parseSource(SOURCE);
  const first = buildResidentPlan(contract);
  const second = buildResidentPlan(contract);
  assert.deepEqual(first, second);
  assert.equal(first.length, 6);
  assert.deepEqual(first.map((resident) => resident.publicDisplayName), DISPLAY_NAMES);
  assert.deepEqual(first.map((resident) => resident.familyId), FAMILY_IDS);
  assert.equal(new Set(first.map((resident) => resident.characterBundle)).size, 6);
  assert.equal(new Set(first.map((resident) => canonicalJson(resident.position))).size, 6);
  assert.equal(sha256(canonicalJson(first)).length, 64);
});

test('the resident contract fails closed on live-research, writes, calls, or claim drift', async () => {
  const contract = JSON.parse(JSON.stringify(await parseSource(SOURCE)));
  contract.state.researchLiveBlindedCompatible = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.modelCallsAllowed = true;
  contract.state.providerEndorsementClaimed = true;
  contract.state.continuousClothSimulationClaimed = true;
  const result = validateResidentConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /researchLiveBlindedCompatible/);
  assert.match(result.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(result.errors.join('\n'), /modelCallsAllowed/);
  assert.match(result.errors.join('\n'), /providerEndorsementClaimed/);
  assert.match(result.errors.join('\n'), /continuousClothSimulationClaimed/);
});

test('Resident E seals immutable Atmosphere D and family-catalog inputs', async () => {
  const contract = await parseSource(SOURCE);
  for (const [pathKey, hashKey] of [
    ['atmosphereSource', 'atmosphereSourceSha256'],
    ['atmosphereBridge', 'atmosphereBridgeSha256'],
    ['atmosphereTest', 'atmosphereTestSha256'],
    ['atmosphereReport', 'atmosphereReportSha256'],
    ['atmosphereHero', 'atmosphereHeroSha256'],
    ['atmosphereManifest', 'atmosphereManifestSha256'],
    ['familyCatalog', 'familyCatalogSha256'],
    ['familyCatalogManifest', 'familyCatalogManifestSha256'],
    ['publicEmbodimentsSource', 'publicEmbodimentsSourceSha256'],
    ['neutralProductionBodySource', 'neutralProductionBodySourceSha256'],
  ]) {
    assert.equal(
      sha256File(path.resolve(ROOT, contract.metadata[pathKey])),
      contract.metadata[hashKey],
      pathKey,
    );
  }
});

test('the extracted Atmosphere D browser application is exact and source-bound', async () => {
  const contract = await parseSource(SOURCE);
  const application = extractAtmosphereApplication(
    readFileSync(ATMOSPHERE_BRIDGE, 'utf8'),
  );
  assert.equal(
    sha256(application),
    contract.metadata.atmosphereBrowserApplicationSha256,
  );
  assert.match(application, /^async function atmosphereConvergenceBrowserApplication\(/);
  assert.match(application, /window\.__MV_ATMOSPHERE_CONVERGENCE_SNAPSHOT__/);
});

test('all six character bundles are exact, complete, detachable drawspecs', async () => {
  const contract = await parseSource(SOURCE);
  for (const resident of buildResidentPlan(contract)) {
    const bundlePath = path.resolve(ROOT, resident.characterBundle);
    assert.equal(sha256File(bundlePath), resident.characterBundleSha256);
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    assert.equal(bundle.format, 'character-webgpu/drawspec');
    assert.equal(bundle.vertexCount, 2180);
    assert.equal(bundle.jointCount, 55);
    assert.equal(bundle.mesh.indices.length / 3, 1668);
    assert.equal(bundle.materialGroups.length, 4);
    assert.equal(bundle.mantle.detachable, true);
  }
});

test('the immutable E manifest binds source, checker, test, report, and hero bytes', async () => {
  const manifest = await parseSource(MANIFEST);
  for (const binding of [
    manifest.state.source,
    manifest.state.checker,
    manifest.state.test,
    manifest.state.report,
    manifest.state.hero,
  ]) {
    assert.equal(sha256File(path.resolve(ROOT, binding.path)), binding.sha256);
  }
  assert.equal(manifest.state.hero.width, 1600);
  assert.equal(manifest.state.hero.height, 900);
  assert.equal(manifest.state.hero.visuallyInspected, true);
  assert.equal(manifest.state.hero.iterationAccepted, 3);
  assert.equal(manifest.state.residents.namedResidentCount, 6);
  assert.deepEqual(manifest.state.residents.publicDisplayNames, DISPLAY_NAMES);
  assert.equal(manifest.state.residents.neutralStagingFormsHidden, 2);
  assert.equal(manifest.state.boundaries.separateFromLiveExperiment, true);
  assert.equal(manifest.state.boundaries.researchLiveIdentityNeutralPreserved, true);
  assert.equal(manifest.state.boundaries.providerEndorsementClaimed, false);
  assert.equal(manifest.state.boundaries.modelBehaviorSimulated, false);
  assert.equal(manifest.state.boundaries.continuousClothSimulationClaimed, false);
  assert.equal(manifest.state.boundaries.photorealismClaimed, false);
});
