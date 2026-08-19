#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'network-change-events.json');
const LATEST = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'network-change-latest.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-network-change-sentinel.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

if (!existsSync(OUTPUT) || !existsSync(LATEST)) {
  console.error('Expected network change sentinel self-test outputs.');
  process.exit(1);
}

const ledger = JSON.parse(readFileSync(OUTPUT, 'utf8'));
const latest = JSON.parse(readFileSync(LATEST, 'utf8'));
const failures = [];

if (ledger.summary.eventCount !== 1) failures.push('expected one stored change event');
if (ledger.summary.latestEventKind !== 'classification_changed') failures.push('expected classification change event');
if (ledger.summary.lastObservationKind !== 'routine_check') failures.push('expected routine final observation');
if (ledger.summary.changeEventCount !== 1) failures.push('expected one change event count');
if (ledger.policy.staleNetworkReceiptMayDriveActions !== false) failures.push('stale network receipts must not drive actions');
if (ledger.policy.endpointDetailsRedacted !== true) failures.push('expected endpoint redaction');
if (latest.eventKind !== 'routine_check') failures.push('expected latest observation receipt');
if (latest.rawIdentifiersIncluded !== false) failures.push('raw identifiers must be absent');

if (failures.length) {
  console.error(`HoloShell network change sentinel test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('HoloShell network change sentinel test passed.');
