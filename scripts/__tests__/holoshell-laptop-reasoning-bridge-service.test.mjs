#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'laptop-reasoning-bridge-service.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-laptop-reasoning-bridge-service.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

assert.equal(existsSync(OUTPUT), true, 'expected laptop reasoning bridge service self-test output');
const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));

assert.equal(receipt.schemaVersion, 'hololand.holoshell.laptop-reasoning-bridge-service.v0.1.0');
assert.equal(receipt.summary.serviceStatus, 'online');
assert.equal(receipt.summary.serviceMode, 'managed_remote_receipt_bridge');
assert.equal(receipt.summary.pidAlive, true);
assert.equal(receipt.summary.pidCommandVerified, true);
assert.equal(receipt.summary.remoteHostConfigured, true);
assert.equal(receipt.summary.pullRemote, true);
assert.equal(receipt.summary.pushRemote, true);
assert.equal(receipt.summary.processedCount, 1);
assert.equal(receipt.summary.pushedCount, 1);
assert.equal(receipt.policy.stopOnlyVerifiedLaptopReasoningBridgePid, true);
assert.equal(receipt.policy.remoteMutationLimitedToResultReceipts, true);
assert.equal(receipt.policy.forceKillAllowed, false);
assert.equal(receipt.policy.rawCommandLineIncluded, false);
assert.equal(receipt.receipt.destructiveActionsTaken, false);
assert.equal(receipt.receipt.rawCommandLineIncluded, false);
assert.equal(receipt.process.sshKeyPathIncluded, false);
assert.match(receipt.process.commandPreview, /--remote-host <configured>/);
assert.doesNotMatch(JSON.stringify(receipt), /jetson_ed25519|Program Files\\nodejs|Get-CimInstance/i);

console.log('HoloShell laptop reasoning bridge service test passed.');
