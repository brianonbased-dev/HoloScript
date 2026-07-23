#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_PATH = join(ROOT, 'scripts', 'holo-ci', 'systems-0.2-candidate-manifest.json');
const RECEIPT_PATH = join(
  ROOT,
  'artifacts',
  'releases',
  '0.2.0-candidate',
  'systems-0.2-build-receipt.json'
);
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const errors = [];
const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : null;
const receipt = existsSync(RECEIPT_PATH) ? JSON.parse(readFileSync(RECEIPT_PATH, 'utf8')) : null;

if (
  manifest?.schema !== 'holoscript.systems-platform-release-candidate/v1' ||
  manifest?.version !== '0.2.0' ||
  manifest?.machineContract !== 'hs-machine-v33'
) {
  errors.push('candidate manifest identity mismatch');
}
if (
  manifest?.immutablePredecessor?.package !== '@holoscript/systems@0.1.0' ||
  manifest?.promotionPolicy?.latestMutationAllowed !== false
) {
  errors.push('immutable predecessor or dist-tag mutation fence is missing');
}
for (const [id, expected] of Object.entries({
  'linux-x64': '@holoscript/systems-linux-x64',
  'win32-x64': '@holoscript/systems-win32-x64',
})) {
  if (manifest?.platformPackages?.[id]?.name !== expected) {
    errors.push(`candidate manifest is missing ${id} package ${expected}`);
  }
}

if (
  receipt?.schema !== 'holoscript.systems-0.2-build-receipt/v1' ||
  receipt?.ok !== true ||
  receipt?.version !== '0.2.0' ||
  receipt?.machineContract !== 'hs-machine-v33'
) {
  errors.push('build receipt is missing or invalid');
}
if (receipt?.publicStateMutated !== false) {
  errors.push('candidate build must attest that public state was not mutated');
}
if (
  receipt?.coldConsumers?.['linux-x64']?.exitCode !== 5 ||
  receipt?.coldConsumers?.['win32-x64']?.exitCode !== 5
) {
  errors.push('both platform cold consumers must compile and exit 5');
}

const artifacts = [
  receipt?.artifacts?.meta,
  receipt?.artifacts?.platforms?.['linux-x64'],
  receipt?.artifacts?.platforms?.['win32-x64'],
].filter(Boolean);
for (const artifact of artifacts) {
  const path = join(ROOT, artifact.path || '');
  if (!existsSync(path) || !statSync(path).isFile()) {
    errors.push(`missing candidate artifact: ${artifact.path}`);
    continue;
  }
  if (sha256File(path) !== artifact.sha256) {
    errors.push(`candidate artifact digest mismatch: ${artifact.path}`);
  }
  if (artifact.sha256 !== artifact.deterministicRepackSha256) {
    errors.push(`candidate artifact was not reproduced exactly: ${artifact.path}`);
  }
}

const result = {
  schema: 'holoscript.systems-0.2-candidate-check/v1',
  checkedAt: new Date().toISOString(),
  ok: errors.length === 0,
  version: manifest?.version || null,
  machineContract: manifest?.machineContract || null,
  sourceCommit: receipt?.sourceCommit || null,
  artifacts: artifacts.map((artifact) => artifact.path),
  coldConsumers: receipt?.coldConsumers || null,
  publicStateMutated: receipt?.publicStateMutated ?? null,
  errors,
};

if (jsonOutput) console.log(JSON.stringify(result, null, 2));
else if (result.ok) console.log('[systems-0.2-candidate] PASS');
else for (const error of errors) console.error(`[systems-0.2-candidate] FAIL: ${error}`);
process.exitCode = result.ok ? 0 : 1;
