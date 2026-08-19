/* global process, structuredClone */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildGeometryPlan,
  validateGeometryConvergenceContract,
} from '../check-hololand-model-village-geometry-convergence.mjs';

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
  'model-village-receipt-loom-geometry-convergence.holo',
);
const MANIFEST = path.join(
  ROOT,
  'source',
  'layers',
  'vr',
  'frontier',
  'model-village',
  'model-village-receipt-loom-geometry-convergence-manifest.holo',
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

test('Geometry Convergence C parses and owns five bounded architectural kits', async () => {
  const contract = await parseSource(SOURCE);
  const result = validateGeometryConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.deepEqual(result.counts, {
    kits: 5,
    instances: 290,
    batches: 15,
    authorityNodes: 5,
  });
});

test('the HoloScript geometry plan is byte-deterministic and count-exact', async () => {
  const contract = await parseSource(SOURCE);
  const first = buildGeometryPlan(contract.state);
  const second = buildGeometryPlan(contract.state);
  assert.deepEqual(second, first);
  assert.equal(first.length, 290);
  assert.equal(new Set(first.map((entry) => entry.batch)).size, 15);
  assert.equal(
    first.filter((entry) => entry.batch.startsWith('masonry_')).length,
    61,
  );
  assert.equal(
    first.filter((entry) => entry.batch.startsWith('roof_')).length,
    140,
  );
  assert.equal(
    first.filter((entry) => entry.batch.startsWith('window_')).length,
    50,
  );
  assert.equal(
    first.filter((entry) => entry.batch.startsWith('joinery_')).length,
    25,
  );
  assert.equal(
    first.filter((entry) => entry.batch.startsWith('weather_')).length,
    14,
  );
  assert.equal(sha256(canonicalJson(first)).length, 64);
});

test('the geometry contract fails closed on identity, writes, network, or count drift', async () => {
  const contract = structuredClone(await parseSource(SOURCE));
  contract.state.publicFamilyIdentityPresented = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.networkFetchesAllowed = true;
  contract.state.detailInstanceCount += 1;
  const result = validateGeometryConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /identity/);
  assert.match(result.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(result.errors.join('\n'), /networkFetchesAllowed/);
  assert.match(result.errors.join('\n'), /detailInstanceCount/);
});

test('the geometry source seals immutable A and B witness inputs', async () => {
  const contract = await parseSource(SOURCE);
  for (const [pathKey, hashKey] of [
    ['baseScene', 'baseSceneSha256'],
    ['baseBridge', 'baseBridgeSha256'],
    ['baseManifest', 'baseManifestSha256'],
    ['materialSource', 'materialSourceSha256'],
    ['materialBridge', 'materialBridgeSha256'],
    ['materialSynthesis', 'materialSynthesisSha256'],
    ['materialManifest', 'materialManifestSha256'],
    ['materialHero', 'materialHeroSha256'],
    ['referenceConcept', 'referenceConceptSha256'],
  ]) {
    assert.equal(
      sha256File(path.resolve(ROOT, contract.metadata[pathKey])),
      contract.metadata[hashKey],
      pathKey,
    );
  }
});

test('the immutable C manifest binds source, checker, test, report, and hero bytes', async () => {
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
  assert.equal(state.hero.iterationAccepted, 5);
  assert.equal(state.geometry.kitCount, 5);
  assert.equal(state.geometry.instanceCount, 290);
  assert.equal(state.geometry.batchCount, 15);
  assert.equal(state.boundaries.productionResidentClaimed, false);
  assert.equal(state.boundaries.fullWorldConvergenceClaimed, false);
  assert.equal(state.boundaries.gameplayPhysicsClaimed, false);
});
