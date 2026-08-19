#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'control-daemon-service.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-control-daemon-service.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

assert.equal(existsSync(OUTPUT), true, 'expected control daemon service self-test output');
const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));

assert.equal(receipt.schemaVersion, 'hololand.holoshell.control-daemon-service.v0.1.0');
assert.equal(receipt.summary.serviceStatus, 'online');
assert.equal(receipt.summary.serviceMode, 'managed_loopback_daemon');
assert.equal(receipt.summary.pidAlive, true);
assert.equal(receipt.summary.pidCommandVerified, true);
assert.equal(receipt.summary.executeEnabled, false);
assert.equal(receipt.summary.trustedExecuteEnabled, false);
assert.equal(receipt.policy.stopOnlyVerifiedControlDaemonPid, true);
assert.equal(receipt.policy.forceKillAllowed, false);
assert.equal(receipt.receipt.destructiveActionsTaken, false);
assert.equal(receipt.receipt.rawCommandLineIncluded, false);
assert.equal(receipt.process.rawCommandLineIncluded, false);

console.log('HoloShell control daemon service test passed.');
