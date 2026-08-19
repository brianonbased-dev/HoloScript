/* global process, structuredClone */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildAtmospherePlan,
  extractGeometryBrowserApplication,
  validateAtmosphereConvergenceContract,
} from '../check-hololand-model-village-atmosphere-convergence.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = path.resolve(
  process.env.HOLOSCRIPT_ROOT
    || 'C:/Users/josep/Documents/GitHub/HoloScript',
);
const SOURCE = path.join(
  ROOT,
  'source',
  'layers',
  'vr',
  'frontier',
  'model-village',
  'model-village-receipt-loom-atmosphere-convergence.holo',
);
const GEOMETRY_BRIDGE = path.join(
  ROOT,
  'scripts',
  'check-hololand-model-village-geometry-convergence.mjs',
);
const MANIFEST = path.join(
  ROOT,
  'source',
  'layers',
  'vr',
  'frontier',
  'model-village',
  'model-village-receipt-loom-atmosphere-convergence-manifest.holo',
);

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

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function parseSource(sourcePath) {
  const core = await import(pathToFileURL(path.join(
    HOLOSCRIPT_ROOT,
    'packages',
    'core',
    'dist',
    'index.js',
  )).href);
  const parsed = new core.HoloCompositionParser().parse(readFileSync(sourcePath, 'utf8'));
  assert.equal(parsed.success, true, JSON.stringify(parsed.errors));
  const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(parsed.ast);
  return {
    metadata: parsed.ast.metadata,
    state: stateProperties(parsed.ast.state),
    nodes: flatten(sceneIr)
      .filter((node) => node.type !== 'group')
      .map((node) => ({
        id: node.id || null,
        type: node.type,
        props: node.props || {},
      })),
  };
}

test('Atmosphere Convergence D parses and owns nine bounded atmosphere kits', async () => {
  const contract = await parseSource(SOURCE);
  const result = validateAtmosphereConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.deepEqual(result.counts, {
    kits: 9,
    instances: 442,
    batches: 11,
    authorityNodes: 9,
    practicalLights: 6,
  });
});

test('the HoloScript atmosphere plan is byte-deterministic and count-exact', async () => {
  const contract = await parseSource(SOURCE);
  const first = buildAtmospherePlan(contract.state);
  const second = buildAtmospherePlan(contract.state);
  assert.deepEqual(second, first);
  assert.equal(first.length, 442);
  assert.equal(new Set(first.map((entry) => entry.batch)).size, 11);
  for (const [kit, expected] of Object.entries({
    rainField: 320,
    mistSheets: 10,
    practicalLanterns: 18,
    wetPuddles: 14,
    chimneySmoke: 12,
    waterRipples: 8,
    windFoliage: 48,
    contactDepth: 6,
    cloudVeils: 6,
  })) {
    assert.equal(
      first.filter((entry) => entry.kit === kit).length,
      expected,
      kit,
    );
  }
  assert.equal(sha256(canonicalJson(first)).length, 64);
});

test('the atmosphere contract fails closed on identity, writes, network, or claims drift', async () => {
  const contract = structuredClone(await parseSource(SOURCE));
  contract.state.publicFamilyIdentityPresented = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.networkFetchesAllowed = true;
  contract.state.volumetricFogClaimed = true;
  contract.state.atmosphereInstanceCount += 1;
  const result = validateAtmosphereConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /identity/);
  assert.match(result.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(result.errors.join('\n'), /networkFetchesAllowed/);
  assert.match(result.errors.join('\n'), /volumetricFogClaimed/);
  assert.match(result.errors.join('\n'), /atmosphereInstanceCount/);
});

test('the atmosphere source seals immutable Geometry Convergence C inputs', async () => {
  const contract = await parseSource(SOURCE);
  for (const [pathKey, hashKey] of [
    ['geometrySource', 'geometrySourceSha256'],
    ['geometryBridge', 'geometryBridgeSha256'],
    ['geometryTest', 'geometryTestSha256'],
    ['geometryReport', 'geometryReportSha256'],
    ['geometryHero', 'geometryHeroSha256'],
    ['geometryManifest', 'geometryManifestSha256'],
  ]) {
    assert.equal(
      sha256File(path.resolve(ROOT, contract.metadata[pathKey])),
      contract.metadata[hashKey],
      pathKey,
    );
  }
});

test('the extracted Geometry C browser application is exact and source-bound', async () => {
  const contract = await parseSource(SOURCE);
  const application = extractGeometryBrowserApplication(
    readFileSync(GEOMETRY_BRIDGE, 'utf8'),
  );
  assert.equal(
    sha256(application),
    contract.metadata.geometryBrowserApplicationSha256,
  );
  assert.match(application, /^async function geometryConvergenceBrowserApplication\(/);
  assert.match(application, /window\.__MV_GEOMETRY_CONVERGENCE_SNAPSHOT__/);
});

test('the immutable D manifest binds source, checker, test, report, and hero bytes', async () => {
  const manifest = await parseSource(MANIFEST);
  const state = manifest.state;
  for (const binding of [
    state.source,
    state.checker,
    state.test,
    state.report,
    state.hero,
  ]) {
    assert.equal(sha256File(path.resolve(ROOT, binding.path)), binding.sha256);
  }
  assert.equal(state.hero.width, 1600);
  assert.equal(state.hero.height, 900);
  assert.equal(state.hero.visuallyInspected, true);
  assert.equal(state.hero.iterationAccepted, 2);
  assert.equal(state.atmosphere.kitCount, 9);
  assert.equal(state.atmosphere.instanceCount, 442);
  assert.equal(state.atmosphere.batchCount, 11);
  assert.equal(state.atmosphere.practicalLightCount, 6);
  assert.equal(state.boundaries.atmosphereConvergenceClaimed, true);
  assert.equal(state.boundaries.productionResidentClaimed, false);
  assert.equal(state.boundaries.fullWorldConvergenceClaimed, false);
  assert.equal(state.boundaries.gameplayPhysicsClaimed, false);
  assert.equal(state.boundaries.continuousWeatherSimulationClaimed, false);
  assert.equal(state.boundaries.volumetricFogClaimed, false);
  assert.equal(state.boundaries.fluidSimulationClaimed, false);
});
