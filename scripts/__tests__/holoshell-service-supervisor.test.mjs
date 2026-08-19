#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'service-supervisor.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-service-supervisor.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

assert.equal(existsSync(OUTPUT), true, 'expected service supervisor self-test output');
const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));

assert.equal(receipt.schemaVersion, 'hololand.holoshell.service-supervisor.v0.1.0');
assert.equal(receipt.summary.requiredAttentionCount, 0);
assert.equal(receipt.summary.requiredServiceCount, 2);
assert.equal(receipt.summary.managedPidServiceCount, 3);
assert.equal(receipt.summary.verifiedPidServiceCount, 3);
assert.equal(receipt.summary.heartbeatOnlyServiceCount, 1);
assert.equal(receipt.summary.localDaemonServiceCount, 1);
assert.equal(receipt.summary.remoteReceiptBridgeServiceCount, 1);
assert.equal(receipt.policy.arbitraryProcessStopAllowed, false);
assert.equal(receipt.policy.forceKillAllowed, false);
assert.equal(receipt.policy.upstreamTerminalEventStreamRequired, true);
assert.equal(receipt.policy.terminalEventReadCapabilityLane, 'terminal_event_read');
assert.equal(receipt.sourceAnchors.upstreamTerminalEventStream, 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus');
assert.equal(receipt.receipt.destructiveActionsTaken, false);
assert.equal(receipt.receipt.rawCommandLineIncluded, false);
assert.equal(receipt.services.some((service) => service.serviceId === 'network-sentinel-service' && service.pidCommandVerified), true);
assert.equal(receipt.services.some((service) => service.serviceId === 'laptop-reasoning-bridge-service' && service.pidCommandVerified), true);
assert.equal(receipt.services.some((service) => service.serviceId === 'holoshell-control-daemon' && service.pidCommandVerified), true);

console.log('HoloShell service supervisor test passed.');
