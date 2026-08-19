#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'native-wrapper.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-native-wrapper.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

assert.equal(existsSync(OUTPUT), true, 'expected native wrapper self-test output');
const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));

assert.equal(receipt.schemaVersion, 'hololand.holoshell.native-wrapper.v0.1.0');
assert.equal(receipt.summary.status, 'launchable_wrapper_present');
assert.equal(receipt.summary.launchable, true);
assert.equal(receipt.summary.startsWithoutManualHtml, true);
assert.equal(receipt.summary.startupIntegrationPresent, true);
assert.equal(receipt.summary.startupRegistered, false);
assert.equal(receipt.summary.localMutationExecutionEnabled, false);
assert.equal(receipt.summary.upstreamCapabilityEnvelopeStatus, 'ready');
assert.equal(receipt.summary.upstreamCapabilityEnvelopePresent, true);
assert.equal(receipt.summary.upstreamCapabilityEnvelopeSchema, 'holoscript.holoshell.native-capability-envelope.v0.1.0');
assert.equal(receipt.summary.nativeCapabilityLaneCount, 7);
assert.equal(receipt.summary.nativeCapabilityLanesReady, true);
assert.equal(receipt.summary.upstreamTerminalEventStreamStatus, 'ready');
assert.equal(receipt.summary.upstreamTerminalEventStreamPresent, true);
assert.equal(receipt.summary.upstreamTerminalEventStreamSchema, 'holoscript.holoshell.native-terminal-event-stream.v0.1.0');
assert.equal(receipt.summary.nativeTerminalEventKindsReady, true);
assert.equal(receipt.capabilityEnvelope.source, 'HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus');
assert.deepEqual(receipt.capabilityEnvelope.missingLanes, []);
assert.equal(receipt.terminalEventStream.source, 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus');
assert.deepEqual(receipt.terminalEventStream.missingEventKinds, []);
assert.equal(receipt.policy.launcherMayClaimOsReplacement, false);
assert.equal(receipt.policy.startupRegistrationRequiresApproval, true);
assert.equal(receipt.policy.startupRegistrationAdapterPresent, true);
assert.equal(receipt.policy.upstreamCapabilityEnvelopeRequired, true);
assert.equal(receipt.policy.upstreamTerminalEventStreamRequired, true);
assert.equal(receipt.policy.nativeCapabilityLaneGrantRequired, true);
assert.equal(receipt.policy.terminalEventsBeforeTerminalUi, true);
assert.equal(receipt.policy.daemonExecuteDisabledByDefault, true);
assert.equal(receipt.receipt.launchPerformed, false);
assert.equal(receipt.receipt.startupRegistered, false);
assert.equal(receipt.receipt.destructiveActionsTaken, false);
assert.equal(receipt.receipt.rawCommandLineIncluded, false);
assert.equal(Boolean(receipt.receipt.wrapperSnapshotHash), true);

console.log('HoloShell native wrapper test passed.');
