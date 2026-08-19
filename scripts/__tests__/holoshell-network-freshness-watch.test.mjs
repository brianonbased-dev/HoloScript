#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'network-freshness.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-network-freshness-watch.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

if (!existsSync(OUTPUT)) {
  console.error(`Expected self-test output at ${OUTPUT}`);
  process.exit(1);
}

const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));
const failures = [];

if (receipt.summary.status !== 'refreshed') failures.push('expected refreshed status');
if (receipt.summary.previousClassification !== 'metered_or_hotspot') failures.push('expected hotspot fixture previous classification');
if (receipt.summary.currentClassification !== 'normal_unmetered') failures.push('expected normal fixture current classification');
if (receipt.summary.classificationChanged !== true) failures.push('expected classification change');
if (receipt.summary.signatureChanged !== true) failures.push('expected signature change');
if (receipt.policy.staleNetworkReceiptMayDriveActions !== false) failures.push('stale network receipts must not drive Brittney');
if (receipt.policy.refreshBeforeLiveFeed !== true) failures.push('expected live-feed refresh ordering policy');
if (receipt.policy.endpointDetailsRedacted !== true) failures.push('expected endpoint redaction');
if (receipt.receipt.rawIdentifiersIncluded !== false) failures.push('raw identifiers must be absent');

if (failures.length) {
  console.error(`HoloShell network freshness test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('HoloShell network freshness watch test passed.');
