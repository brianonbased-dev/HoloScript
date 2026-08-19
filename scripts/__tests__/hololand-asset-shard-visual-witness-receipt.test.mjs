#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
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

run('node', ['scripts/__tests__/holoshell-asset-shard-visual-witness.test.mjs']);
run('node', [
  'scripts/hololand-asset-shard-visual-witness-receipt.mjs',
  '--output',
  '.tmp/hololand/asset-shard-2-visual-witness-receipt.json',
  '--markdown-output',
  '.tmp/hololand/asset-shard-2-visual-witness-receipt.md',
]);

const receipt = readJson('.tmp/hololand/asset-shard-2-visual-witness-receipt.json');

assert(receipt.schema === 'hololand.human-os.asset-shard-visual-witness-receipt.v0.1.0', 'schema mismatch');
assert(receipt.status === 'pass', 'receipt should pass');
assert(receipt.enterpriseGate.id === 'creator-asset-shard-room', 'unexpected gate id');
assert(receipt.promotedAppSource.files.length === 3, 'promoted source trio should have three files');
assert(receipt.promotedAppSource.files.every((file) => file.exists && file.sha256), 'promoted source hashes missing');
assert(receipt.witness.visualWitnessStatus === 'pass', 'visual witness did not pass');
assert(receipt.witness.playableWitnessStatus === 'pass', 'playable witness did not pass');
assert(receipt.witness.sourceAssetsMutated === false, 'source assets must remain read-only');
assert(receipt.witness.missingText.length === 0, 'visual witness should have no missing text');
assert(
  receipt.archiveDecision.status === 'candidate_ready_for_jetson_archive_receipt',
  'asset-folder v1 should be cleared only for Jetson archive receipt'
);
assert(receipt.archiveDecision.deletionAllowed === false, 'receipt must not allow deletion');
assert(receipt.archiveDecision.transferExecuted === false, 'receipt must not claim transfer');
assert(receipt.archiveDecision.supersededSources.length === 3, 'superseded v1 source trio should have three files');
assert(receipt.checks.every((check) => check.status === 'pass'), 'all checks should pass');

console.log('hololand asset-shard-2 visual witness receipt test passed');
