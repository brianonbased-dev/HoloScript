#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'network-sentinel-service.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-network-sentinel-service.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

if (!existsSync(OUTPUT)) {
  console.error('Expected network sentinel service self-test output.');
  process.exit(1);
}

const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));
const failures = [];

if (receipt.schemaVersion !== 'hololand.holoshell.network-sentinel-service.v0.1.0') failures.push('schemaVersion mismatch');
if (receipt.summary.serviceStatus !== 'online') failures.push('expected online fixture status');
if (receipt.summary.pidAlive !== true) failures.push('expected alive PID fixture');
if (receipt.summary.pidCommandVerified !== true) failures.push('expected verified PID fixture');
if (receipt.summary.eventCount < 1) failures.push('expected event ledger summary');
if (receipt.policy.stopOnlyVerifiedSentinelPid !== true) failures.push('stop must require verified sentinel PID');
if (receipt.policy.forceKillAllowed !== false) failures.push('force kill must be disabled');
if (receipt.policy.staleNetworkReceiptMayDriveActions !== false) failures.push('stale network receipts must not drive actions');
if (receipt.receipt.rawCommandLineIncluded !== false) failures.push('raw command lines must not be included');
if (receipt.receipt.destructiveActionsTaken !== false) failures.push('self-test must not perform destructive actions');

if (failures.length) {
  console.error(`HoloShell network sentinel service test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('HoloShell network sentinel service test passed.');
