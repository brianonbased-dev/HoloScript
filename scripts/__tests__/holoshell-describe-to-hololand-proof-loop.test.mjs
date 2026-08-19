#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'describe-to-hololand-proof-loop');
const RECEIPT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const WORLD_PATH = path.join(OUTPUT_DIR, 'generated-world.holo');
const HTML_PATH = path.join(OUTPUT_DIR, 'proof-loop.html');
const REGISTRY_PATH = path.join(OUTPUT_DIR, 'hololand-registry.json');
const LEARNING_PATH = path.join(OUTPUT_DIR, 'learning-signal.jsonl');
const DESCRIPTION = 'Create a source-first HoloLand room where agents can see intent, generated source, validation, registration, receipts, and the first next action.';

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
  'scripts/holoshell-describe-to-hololand-proof-loop.mjs',
  '--description',
  DESCRIPTION,
  '--output-dir',
  OUTPUT_DIR,
  '--receipt',
  RECEIPT_PATH,
  '--world',
  WORLD_PATH,
  '--html',
  HTML_PATH,
  '--registry',
  REGISTRY_PATH,
  '--learning',
  LEARNING_PATH,
  '--json',
]);

const receipt = readJson(RECEIPT_PATH);
assert.equal(receipt.schema, 'hololand.holoshell.describe-to-hololand-proof-loop.v0.1.0');
assert.equal(receipt.status, 'pass');
assert.equal(receipt.contractSource.path, 'apps/holoshell/source/holoshell-describe-to-hololand-proof-loop.hsplus');
assert.match(receipt.contractSource.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.generatedWorld.path, '.tmp/holoshell/self-test/describe-to-hololand-proof-loop/generated-world.holo');
assert.match(receipt.generatedWorld.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.validation.status, 'pass');
assert.equal(receipt.validation.contractSource.status, 'pass');
assert.equal(receipt.validation.generatedWorld.status, 'pass');
assert.equal(receipt.registration.status, 'registered');
assert.equal(receipt.registration.projectionOnly, true);
assert.equal(receipt.render.status, 'ready');
assert.equal(receipt.agentTrace.status, 'recorded');
assert.match(receipt.agentTrace.firstNextCommand, /holoshell-describe-to-hololand-proof-loop\.mjs/);
assert.equal(receipt.learningSignal.status, 'ready');
assert.equal(receipt.learningSignal.rowCount, 3);
assert.equal(receipt.learningSignal.corpusCandidate, true);
assert.match(receipt.receipt.sha256, /^[a-f0-9]{64}$/);

const world = readFileSync(WORLD_PATH, 'utf8');
assert.match(world, /composition "Generated HoloLand Proof Room"/);
assert.match(world, /object "AgentTraceToken"/);
assert.match(world, /receiptRequired: true/);

const html = readFileSync(HTML_PATH, 'utf8');
assert.match(html, /Describe To HoloLand/);
assert.match(html, /agent-visible-trace/);
assert.match(html, /learning-signal/);
assert.match(html, /source_precedes_projection/);

const registry = readJson(REGISTRY_PATH);
assert.equal(registry.schema, 'hololand.holoshell.describe-to-hololand-registry.v0.1.0');
assert.equal(registry.status, 'registered');
assert.equal(registry.projectionOnly, true);

const signals = readFileSync(LEARNING_PATH, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
assert.equal(signals.length, 3);
assert.deepEqual(signals.map((signal) => signal.type), ['pattern', 'decision', 'next_action']);
assert.ok(signals.every((signal) => signal.sourceReceipt === receipt.receipt.output));

console.log('holoshell describe-to-HoloLand proof loop test passed');
