/* global process, structuredClone */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  extractBaseBrowserApplication,
  validateMaterialConvergenceContract,
} from '../check-hololand-model-village-material-convergence.mjs';
import {
  MATERIAL_CHANNELS,
  synthesizeMaterialSet,
} from '../lib/model-village-material-synthesis.mjs';

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
  'model-village-receipt-loom-material-convergence.holo',
);
const BASE_BRIDGE = path.join(
  ROOT,
  'scripts',
  'check-hololand-model-village-receipt-loom-courtyard.mjs',
);
const MANIFEST = path.join(
  ROOT,
  'source',
  'layers',
  'vr',
  'frontier',
  'model-village',
  'model-village-receipt-loom-material-convergence-manifest.holo',
);

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
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

async function sourceContract() {
  const core = await import(pathToFileURL(path.join(
    HOLOSCRIPT_ROOT,
    'packages',
    'core',
    'dist',
    'index.js',
  )).href);
  const parsed = new core.HoloCompositionParser().parse(readFileSync(SOURCE, 'utf8'));
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

test('Material Convergence B parses and carries four HoloScript-owned PBR surfaces', async () => {
  const contract = await sourceContract();
  const result = validateMaterialConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.equal(result.counts.surfaces, 4);
  assert.equal(result.counts.channels, 16);
  assert.equal(result.counts.bindings, 6);
  assert.equal(result.counts.authorityNodes, 4);
});

test('each authored material recipe is byte-deterministic and hash-bound', async () => {
  const contract = await sourceContract();
  for (const [surfaceKey, spec] of Object.entries(contract.state.materialSurfaces)) {
    const first = synthesizeMaterialSet(spec);
    const second = synthesizeMaterialSet(spec);
    assert.deepEqual(first.hashes, spec.hashes, `${surfaceKey} source hashes`);
    assert.deepEqual(second.hashes, first.hashes, `${surfaceKey} repeat synthesis`);
    assert.deepEqual(Object.keys(first.channels).sort(), [...MATERIAL_CHANNELS].sort());
    for (const channel of MATERIAL_CHANNELS) {
      assert.deepEqual(first.channels[channel], second.channels[channel]);
      assert.equal(first.channels[channel].byteLength, spec.resolution ** 2 * 4);
    }
  }
});

test('the material contract fails closed on recipe hash drift', async () => {
  const contract = structuredClone(await sourceContract());
  contract.state.materialSurfaces.agedTimber.seed += 1;
  const result = validateMaterialConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /bytes do not match the authored hash/);
});

test('the material contract fails closed on identity, writes, or network leakage', async () => {
  const contract = structuredClone(await sourceContract());
  contract.state.publicFamilyIdentityPresented = true;
  contract.state.canonicalWritesAllowed = true;
  contract.state.networkFetchesAllowed = true;
  const result = validateMaterialConvergenceContract(contract, ROOT);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /identity/);
  assert.match(result.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(result.errors.join('\n'), /networkFetchesAllowed/);
});

test('the B bridge extracts the accepted A browser application without editing it', () => {
  const source = readFileSync(BASE_BRIDGE, 'utf8');
  const application = extractBaseBrowserApplication(source);
  assert.match(
    application,
    /^async function courtyardBrowserApplication\(THREE, RoomEnvironment, payload\)/,
  );
  assert.match(application, /window\.__MV_COURTYARD_WITNESS__/);
  assert.match(application, /renderer\.render\(scene, camera\)/);
  assert.ok(application.length > 30_000);
});

test('the immutable B manifest binds source, bridge, synthesis, test, report, and hero bytes', async () => {
  const core = await import(pathToFileURL(path.join(
    HOLOSCRIPT_ROOT,
    'packages',
    'core',
    'dist',
    'index.js',
  )).href);
  const parsed = new core.HoloCompositionParser().parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(parsed.success, true, JSON.stringify(parsed.errors));
  const manifest = stateProperties(parsed.ast.state);
  for (const binding of [
    manifest.source,
    manifest.checker,
    manifest.synthesis,
    manifest.test,
    manifest.report,
    manifest.hero,
  ]) {
    assert.equal(sha256File(path.resolve(ROOT, binding.path)), binding.sha256);
  }
  assert.equal(manifest.hero.width, 1600);
  assert.equal(manifest.hero.height, 900);
  assert.equal(manifest.hero.visuallyInspected, true);
  assert.equal(manifest.surfaces.count, 4);
  assert.equal(manifest.surfaces.channelCount, 16);
  assert.equal(manifest.boundaries.productionResidentClaimed, false);
  assert.equal(manifest.boundaries.fullWorldConvergenceClaimed, false);
  assert.equal(manifest.boundaries.gameplayPhysicsClaimed, false);
});
