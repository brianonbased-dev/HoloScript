import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  validateCourtyardContract,
} from '../check-hololand-model-village-receipt-loom-courtyard.mjs';

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
  'model-village-receipt-loom-courtyard.holo',
);
const MANIFEST = path.join(
  ROOT,
  'source',
  'layers',
  'vr',
  'frontier',
  'model-village',
  'model-village-receipt-loom-courtyard-manifest.holo',
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

test('Art Convergence A parses and carries the complete HoloScript source contract', async () => {
  const contract = await sourceContract();
  const result = validateCourtyardContract(contract, ROOT);
  assert.equal(result.status, 'pass', result.errors.join('\n'));
  assert.equal(result.counts.neutralResidents, 2);
  assert.equal(result.counts.uniquePresentationKits, 10);
  assert.ok(result.counts.lights >= 4);
});

test('the art tracer fails closed if public family identity leaks into a resident', async () => {
  const contract = structuredClone(await sourceContract());
  const resident = contract.nodes.find(
    (node) => node.props?.properties?.neutralSeat === 'Seat01',
  );
  resident.props.properties.publicFamilyIdentity = true;
  const result = validateCourtyardContract(contract, ROOT);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /identity-neutral/);
});

test('the art tracer fails closed if canonical writes or external network fetches are enabled', async () => {
  const contract = structuredClone(await sourceContract());
  contract.state.canonicalWritesAllowed = true;
  contract.state.networkFetchesAllowed = true;
  const result = validateCourtyardContract(contract, ROOT);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /canonicalWritesAllowed/);
  assert.match(result.errors.join('\n'), /networkFetchesAllowed/);
});

test('the immutable manifest binds the accepted source, checker, test, and hero bytes', async () => {
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
  assert.equal(sha256File(path.resolve(ROOT, manifest.source.path)), manifest.source.sha256);
  assert.equal(sha256File(path.resolve(ROOT, manifest.checker.path)), manifest.checker.sha256);
  assert.equal(sha256File(path.resolve(ROOT, manifest.checker.testPath)), manifest.checker.testSha256);
  assert.equal(sha256File(path.resolve(ROOT, manifest.hero.path)), manifest.hero.sha256);
  assert.equal(manifest.hero.width, 1600);
  assert.equal(manifest.hero.height, 900);
  assert.equal(manifest.hero.visuallyInspected, true);
  assert.equal(manifest.boundaries.productionResidentClaimed, false);
  assert.equal(manifest.boundaries.fullWorldConvergenceClaimed, false);
});
