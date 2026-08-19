#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'startup-integration.json');

const result = spawnSync(process.execPath, ['scripts/holoshell-startup-integration.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

assert.equal(existsSync(OUTPUT), true, 'expected startup integration self-test output');
const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));

assert.equal(receipt.schemaVersion, 'hololand.holoshell.startup-integration.v0.1.0');
assert.equal(receipt.summary.status, 'registration_adapter_present');
assert.equal(receipt.summary.startupIntegrationPresent, true);
assert.equal(receipt.summary.registrationScriptPresent, true);
assert.equal(receipt.summary.nativeLauncherPresent, true);
assert.equal(receipt.summary.startupRegistered, false);
assert.equal(receipt.summary.approvalRequired, true);
assert.equal(receipt.summary.localMutationExecutionEnabled, false);
assert.equal(receipt.policy.perUserStartupOnly, true);
assert.equal(receipt.policy.explorerShellReplacementBlocked, true);
assert.equal(receipt.policy.registrationRequiresExplicitApproval, true);
assert.equal(receipt.receipt.registrationPerformed, false);
assert.equal(receipt.receipt.startupRegistered, false);
assert.equal(receipt.receipt.destructiveActionsTaken, false);
assert.equal(receipt.receipt.rawStartupPathIncluded, false);
assert.equal(Boolean(receipt.receipt.startupIntegrationHash), true);

console.log('HoloShell startup integration test passed.');
