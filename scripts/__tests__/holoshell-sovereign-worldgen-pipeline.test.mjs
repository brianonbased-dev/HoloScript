#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'sovereign-worldgen-pipeline');
const RECEIPT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const WORLD_PATH = path.join(OUTPUT_DIR, 'generated-world.holo');
const ASSET_GRAPH_PATH = path.join(OUTPUT_DIR, 'asset-graph.json');
const HTML_PATH = path.join(OUTPUT_DIR, 'world-preview.html');
const REGISTRY_PATH = path.join(OUTPUT_DIR, 'hololand-worldgen-registry.json');
const LEARNING_PATH = path.join(OUTPUT_DIR, 'learning-signal.jsonl');
const PROMPT = 'Generate a navigable coastal ruin with a safe ridge path, a visible portal checkpoint, Quest 3 budget, and provenance markers.';
const OBSERVED = JSON.stringify({
  imageObservationRef: 'fixture://coastal-ruin-sketch.png',
  facts: [
    { label: 'coastal cliff silhouette', confidence: 0.94 },
    { label: 'arched stone ruin', confidence: 0.89 },
    { label: 'walkable foreground path', confidence: 0.92 },
    { label: 'cyan orange sunset palette', confidence: 0.81 },
  ],
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

rmSync(OUTPUT_DIR, { recursive: true, force: true });

run(process.execPath, [
  'scripts/holoshell-sovereign-worldgen-pipeline.mjs',
  '--prompt',
  PROMPT,
  '--observed',
  OBSERVED,
  '--output-dir',
  OUTPUT_DIR,
  '--receipt',
  RECEIPT_PATH,
  '--world',
  WORLD_PATH,
  '--asset-graph',
  ASSET_GRAPH_PATH,
  '--html',
  HTML_PATH,
  '--registry',
  REGISTRY_PATH,
  '--learning',
  LEARNING_PATH,
  '--json',
]);

const receipt = readJson(RECEIPT_PATH);
assert.equal(receipt.schema, 'hololand.holoshell.sovereign-worldgen-pipeline.v0.1.0');
assert.equal(receipt.status, 'pass');
assert.equal(receipt.matrixGap, 'HL-013');
assert.equal(receipt.contractSource.path, 'apps/holoshell/source/holoshell-sovereign-worldgen-pipeline.hsplus');
assert.equal(receipt.contractSource.format, 'hsplus');
assert.match(receipt.contractSource.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.generatedWorld.path, '.tmp/holoshell/self-test/sovereign-worldgen-pipeline/generated-world.holo');
assert.match(receipt.generatedWorld.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.assetGraph.path, '.tmp/holoshell/self-test/sovereign-worldgen-pipeline/asset-graph.json');
assert.match(receipt.assetGraph.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.validation.status, 'pass');
assert.equal(receipt.validation.contractSource.status, 'pass');
assert.equal(receipt.validation.generatedWorld.status, 'pass');
assert.equal(receipt.validation.assetGraph.status, 'pass');
assert.equal(receipt.provenance.observedFactCount, 4);
assert.equal(receipt.provenance.inferredDecisionCount, 3);
assert.equal(receipt.provenance.observedVsInferredExplicit, true);
assert.equal(receipt.navigation.navigationPathPresent, true);
assert.deepEqual(receipt.navigation.navigationPath, ['spawn_anchor', 'walkable_ridge_path', 'portal_checkpoint']);
assert.equal(receipt.navigation.collisionMeshPresent, true);
assert.equal(receipt.questBudget.status, 'passed');
assert.equal(receipt.questBudget.target, 'quest3-webxr');
assert.equal(receipt.competitorBoundary.opaqueSplatDependencyPresent, false);
assert.equal(receipt.competitorBoundary.compileTo3dgsBridgeOnly, true);
assert.equal(receipt.compile.status, 'ready');
assert.equal(receipt.compile.projectionOnly, true);
assert.equal(receipt.render.status, 'ready');
assert.equal(receipt.registry.status, 'registered');
assert.equal(receipt.learningSignal.status, 'ready');
assert.equal(receipt.learningSignal.rowCount, 4);
assert.match(receipt.receipt.sha256, /^[a-f0-9]{64}$/);

const graph = readJson(ASSET_GRAPH_PATH);
assert.equal(graph.graphId, receipt.assetGraph.graphId);
assert.equal(graph.dependencies.opaqueSplatDependencyPresent, false);
assert.equal(graph.dependencies.marbleBridgeRole, 'optional_import_fixture_only');
assert.ok(graph.nodes.some((node) => node.id === 'walkable_ridge_path' && node.navigation === true));
assert.ok(graph.nodes.some((node) => node.kind === 'collision'));
assert.ok(graph.observedFacts.every((fact) => fact.provenanceClass === 'observed'));
assert.ok(graph.inferredDecisions.every((decision) => decision.provenanceClass === 'inferred'));

const world = readFileSync(WORLD_PATH, 'utf8');
assert.match(world, /composition "Sovereign Generated Navigable World"/);
assert.match(world, /spatial_group "TypedAssetGraph"/);
assert.match(world, /object "WalkableRidgePath"/);
assert.match(world, /object "PortalCheckpoint"/);
assert.match(world, /object "CollisionGuardrailLeft"/);
assert.match(world, /object "ObservedImageFactsMarker"/);
assert.match(world, /representation: "typed_asset_graph_not_opaque_splat"/);
assert.match(world, /opaque_splat_dependency_present: false/);

const html = readFileSync(HTML_PATH, 'utf8');
assert.match(html, /Sovereign Worldgen Proof/);
assert.match(html, /data-navigable-world="true"/);
assert.match(html, /portal/);
assert.match(html, /Quest\/WebXR budget: passed/);

const registry = readJson(REGISTRY_PATH);
assert.equal(registry.schema, 'hololand.worldgen.registry.v0.1.0');
assert.equal(registry.status, 'registered');
assert.equal(registry.matrixGap, 'HL-013');
assert.equal(registry.projectionOnly, true);

const signals = readFileSync(LEARNING_PATH, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
assert.equal(signals.length, 4);
assert.deepEqual(signals.map((signal) => signal.type), ['pattern', 'decision', 'receipt', 'next_action']);
assert.ok(signals.every((signal) => signal.sourceReceipt === receipt.receipt.output));

assert.ok(existsSync(HTML_PATH), 'preview HTML missing');

console.log('holoshell sovereign worldgen pipeline test passed');
