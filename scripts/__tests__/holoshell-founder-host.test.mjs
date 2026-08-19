#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'founder-host.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-founder-host.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

assert.equal(existsSync(OUTPUT), true, 'expected founder host self-test output');
const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));

assert.equal(receipt.schemaVersion, 'hololand.holoshell.founder-host.v0.1.0');
assert.equal(receipt.summary.status, 'ready_for_native_wrapper');
assert.equal(receipt.summary.sourceReady, true);
assert.equal(receipt.summary.previewHostReady, true);
assert.equal(receipt.summary.shellObjectGraphReady, true);
assert.equal(receipt.summary.liveFeedReady, true);
assert.equal(receipt.summary.nativeWrapperPresent, false);
assert.equal(receipt.summary.primarySurfaceOwnership, 'preview_only');
assert.equal(receipt.summary.localMutationExecutionEnabled, false);
assert.equal(receipt.policy.nativeWrapperRequiredForPrimarySurface, true);
assert.equal(receipt.policy.appMutationsRequireApprovalBundle, true);
assert.equal(receipt.receipt.hostLaunched, false);
assert.equal(receipt.receipt.startupRegistered, false);
assert.equal(receipt.receipt.destructiveActionsTaken, false);
assert.equal(receipt.receipt.rawCommandLineIncluded, false);
assert.equal(receipt.bootPhases.some((phase) => phase.phaseId === 'native_wrapper' && phase.status === 'missing'), true);

console.log('HoloShell Founder host test passed.');
