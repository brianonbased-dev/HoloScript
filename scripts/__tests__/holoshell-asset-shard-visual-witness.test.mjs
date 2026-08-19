#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasAbsolutePath(value) {
  return /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/.test(String(value || ''));
}

// ── Phase 1: Workflow preview visual witness (existing test) ──

run('node', ['scripts/holoshell-asset-shard-workflow.mjs', '--self-test']);
run('node', [
  'scripts/holoshell-visual-witness.mjs',
  '--shard-workflow',
  '.tmp/holoshell/shard-workflow-latest.json',
  '--preview-source',
  '.tmp/holoshell/shard-preview.holo',
  '--output',
  '.tmp/holoshell/self-test/asset-shard-visual-witness.json',
  '--js-output',
  '.tmp/holoshell/self-test/asset-shard-visual-witness.js',
  '--output-dir',
  '.tmp/holoshell/self-test/asset-shard-visual-witness',
  '--json',
]);

const receipt = readJson('.tmp/holoshell/self-test/asset-shard-visual-witness.json');

assert(receipt.schemaVersion === 'hololand.holoshell.visual-witness.v0.1.0', 'schema mismatch');
assert(receipt.status === 'pass', 'visual witness should pass');
assert(receipt.shardWitness?.enabled === true, 'missing shard witness envelope');
assert(receipt.shardWitness.previewHash, 'missing preview hash');
assert(receipt.shardWitness.sourceAssetsMutated === false, 'source assets must not mutate');
assert(receipt.screenshot?.sha256, 'missing screenshot hash');
assert(receipt.domWitness?.sha256, 'missing DOM hash');
assert(Array.isArray(receipt.domWitness?.missingText), 'missing text list absent');
assert(receipt.domWitness.missingText.length === 0, 'expected all shard witness text to render');
assert(existsSync(path.resolve(REPO_ROOT, receipt.screenshot.path)), 'screenshot file missing');

console.log('holoshell asset shard visual witness test passed (workflow preview)');

// ── Phase 2: Import approval + execution ──

run('node', ['scripts/holoshell-shard-import-approval.mjs', '--self-test']);

const importReceipt = readJson('.tmp/holoshell/shard-import-self-test/import-latest.json');

assert(importReceipt.schemaVersion === 'hololand.holoshell.asset-shard-import-receipt.v0.1.0', 'import receipt schema mismatch');
assert(importReceipt.summary.status === 'completed', 'import should be completed');
assert(importReceipt.summary.runtimeMutationExecuted === true, 'import should have executed runtime mutation');
assert(importReceipt.summary.sourceAssetsMutated === false, 'source assets must not be mutated');
assert(importReceipt.output.manifestPath, 'import receipt must have manifestPath');
assert(importReceipt.output.shardSourcePath, 'import receipt must have shardSourcePath');

console.log('holoshell shard import approval test passed');

// ── Phase 2b: Approval command preview redacts private artifact paths ──

const redactionRoot = path.resolve(REPO_ROOT, '.tmp/holoshell/self-test/asset-shard-approval-redaction');
rmSync(redactionRoot, { recursive: true, force: true });

run('node', [
  'scripts/holoshell-shard-import-approval.mjs',
  '--workflow',
  '.tmp/holoshell/shard-workflow-latest.json',
  '--output',
  path.join(redactionRoot, 'approval.json'),
  '--js-output',
  path.join(redactionRoot, 'approval.js'),
  '--bundle-dir',
  path.join(redactionRoot, 'bundles'),
  '--import-dir',
  path.join(redactionRoot, 'imports'),
  '--import-output',
  path.join(redactionRoot, 'import.json'),
  '--import-js-output',
  path.join(redactionRoot, 'import.js'),
  '--json',
]);

const redactedApproval = readJson('.tmp/holoshell/self-test/asset-shard-approval-redaction/approval.json');

assert(redactedApproval.execution.commandPreview.includes('<artifact:approval-bundle>'), 'approval bundle path should be an artifact alias');
assert(redactedApproval.execution.commandPreview.includes('<artifact:import-dir>'), 'import dir path should be an artifact alias');
assert(redactedApproval.execution.commandPreview.includes('<artifact:import-receipt>'), 'import receipt path should be an artifact alias');
assert(redactedApproval.execution.commandPreview.includes('<artifact:import-bootstrap>'), 'import bootstrap path should be an artifact alias');
assert(!hasAbsolutePath(redactedApproval.execution.commandPreview), 'commandPreview must not expose absolute paths');
assert(
  redactedApproval.execution.command.some((part) => hasAbsolutePath(part)),
  'private executable command should still retain real paths'
);

console.log('holoshell shard import approval redaction test passed');

// ── Phase 3: Playable shard visual witness of the imported shard ──

run('node', [
  'scripts/holoshell-visual-witness.mjs',
  '--shard-import-receipt',
  '.tmp/holoshell/shard-import-self-test/import-latest.json',
  '--output',
  '.tmp/holoshell/self-test/imported-shard-visual-witness.json',
  '--js-output',
  '.tmp/holoshell/self-test/imported-shard-visual-witness.js',
  '--output-dir',
  '.tmp/holoshell/self-test/imported-shard-visual-witness',
  '--playable-witness-output',
  '.tmp/holoshell/self-test/playable-shard-witness.json',
  '--playable-witness-js',
  '.tmp/holoshell/self-test/playable-shard-witness.js',
  '--playable-witness-dir',
  '.tmp/holoshell/self-test/playable-shard-witness',
  '--json',
]);

// Verify the full visual witness receipt
const importedWitness = readJson('.tmp/holoshell/self-test/imported-shard-visual-witness.json');

assert(importedWitness.schemaVersion === 'hololand.holoshell.visual-witness.v0.1.0', 'imported witness schema mismatch');
assert(importedWitness.status === 'pass', 'imported shard visual witness should pass');
assert(importedWitness.shardWitness?.enabled === true, 'imported shard witness envelope must be enabled');
assert(importedWitness.shardWitness.shardId, 'imported shard witness must have shardId');
assert(importedWitness.shardWitness.previewHash, 'imported shard witness must have previewHash');
assert(importedWitness.shardWitness.sourceAssetsMutated === false, 'imported shard source assets must not be mutated');
assert(importedWitness.screenshot?.sha256, 'imported shard screenshot hash missing');
assert(importedWitness.domWitness?.sha256, 'imported shard DOM hash missing');
assert(Array.isArray(importedWitness.domWitness?.missingText), 'imported shard missing text list absent');
assert(importedWitness.domWitness.missingText.length === 0, 'expected all imported shard text to render');
assert(existsSync(path.resolve(REPO_ROOT, importedWitness.screenshot.path)), 'imported shard screenshot file missing');

console.log('holoshell imported shard visual witness test passed');

// ── Phase 4: PlayableShardWitnessReceipt validation ──

const playableWitness = readJson('.tmp/holoshell/self-test/playable-shard-witness.json');

assert(playableWitness.schemaVersion === 'hololand.holoshell.playable-shard-witness.v0.1.0', 'playable witness schema mismatch');
assert(playableWitness.status === 'pass', 'playable shard witness should pass');
assert(playableWitness.shardWitness?.enabled === true, 'playable shard witness must be enabled');
assert(playableWitness.shardWitness.previewHash, 'playable shard witness must have previewHash');
assert(playableWitness.shardWitness.sourceAssetsMutated === false, 'playable shard source assets must not be mutated');
assert(typeof playableWitness.shardWitness.workflowReceipt === 'string', 'playable shard witness must reference a workflow/import receipt');
assert(playableWitness.screenshot?.sha256, 'playable shard screenshot hash missing');
assert(typeof playableWitness.screenshot?.sizeBytes === 'number', 'playable shard screenshot size must be a number');
assert(playableWitness.screenshot.sizeBytes > 0, 'playable shard screenshot must be non-empty');
assert(playableWitness.domWitness?.sha256, 'playable shard DOM hash missing');
assert(Array.isArray(playableWitness.domWitness?.missingText), 'playable shard missing text list absent');
assert(playableWitness.domWitness.missingText.length === 0, 'expected all playable shard text to render');
assert(existsSync(path.resolve(REPO_ROOT, playableWitness.screenshot.path)), 'playable shard screenshot file missing');

console.log('holoshell playable shard witness receipt test passed');
